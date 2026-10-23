// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title pixmint by mederu.art — 完全オンチェーンのドット絵
/// @notice ピクセルデータ（PXM v1）を SSTORE2 でチェーンの state に置き、
///         tokenURI のたびに SVG をその場で組み立てる。IPFS もサーバーも使わない。
///         作品データ（絵・タイトル・作者・ロイヤリティ）を書き換える・消す関数は無い（owner にも無い）。
///
///         販売機能を内蔵している。ここで売れたときは mederu の手数料と作者のロイヤリティが
///         必ず差し引かれる。OpenSea など外部では ERC-2981 で作者分だけを申告する（支払いは任意）。
/// @dev ETH / Base とも同じバイトコードで出す。形式は src/pxm.ts を参照。
contract PixMint is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;

    error BadData();
    error BadTitle();
    error BadRoyalty();
    error BadFee();
    error WrongPrice();
    error MintClosed();
    error NotTokenOwner();
    error NotListed();

    event Minted(uint256 indexed id, address indexed creator, bytes32 dataHash);
    event Listed(uint256 indexed id, address indexed seller, uint256 price);
    event Unlisted(uint256 indexed id);
    event Sold(uint256 indexed id, address indexed seller, address indexed buyer, uint256 price);
    event NameSet(address indexed account, string name);

    string public constant PLATFORM = "pixmint by mederu.art";

    uint256 public constant MAX_SIZE = 129;
    /// @dev tokenURI の読み出しを約2,000万 gas 以内に収めるための上限（4096 ランで実測 約2,060万）。
    ///      多くの RPC は eth_call を 5,000万 gas で打ち切るので、それより十分下に置く。
    ///      これでデータは最大 3 + 765 + 8192 = 8,960 bytes になり、1個のコントラクトに収まる
    uint256 public constant MAX_RUNS = 4096;
    /// @dev UTF-8 で 96 bytes（日本語なら32文字）
    uint256 public constant MAX_TITLE = 96;
    /// @dev 表示名。UTF-8 48 bytes（日本語なら16文字）
    uint256 public constant MAX_NAME = 48;
    uint256 public constant MAX_ROYALTY_BPS = 1000; // 作者ロイヤリティの上限 10%
    uint256 public constant MAX_FEE_BPS = 500; // mederu 手数料の上限 5%（owner でも超えられない）

    struct Work {
        address creator;
        uint40 mintedAt;
        uint8 size;
        uint8 colors;
        uint16 royaltyBps;
    }

    uint256 public totalMinted;
    uint256 public mintPrice;
    bool public mintOpen = true;
    uint16 public feeBps = 250; // mederu 手数料 2.5%（販売時）
    /// @notice mint 手数料と販売手数料のうち、まだ引き出していない分
    uint256 public platformBalance;
    /// @notice 送金に失敗した分（受け取り側がコントラクトで ETH を拒んだ等）。claim() で引き出す
    mapping(address => uint256) public pending;
    /// @notice 作品ページの URL の頭。tokenURI の external_url = siteURL/<chainid>/<id>
    ///         （ETH と Base で同じ id があるのでチェーン番号を挟む。例: /1/5 = ETH・/8453/5 = Base）
    string public siteURL = "https://pixmint.mederu.art";

    mapping(uint256 => Work) public works;
    mapping(uint256 => string) private _titles;
    mapping(uint256 => address) private _ptr;
    /// @notice アーティストの表示名（本人がいつでも変えられる。作品データではない）
    mapping(address => string) public displayName;
    /// @notice 出品価格（wei）。0 = 出品していない
    mapping(uint256 => uint256) public listings;

    constructor(address owner_) ERC721("pixmint", "PIXM") Ownable(owner_) {}

    // ───────────────────────── mint ─────────────────────────

    /// @param pxm ピクセルデータ（PXM v1）
    /// @param title 作品タイトル（空なら "pixmint #id"）。UTF-8 96 bytes まで・制御文字不可・変更不可
    /// @param royaltyBps 作者ロイヤリティ（0〜1000 = 0〜10%）。変更不可
    function mint(bytes calldata pxm, string calldata title, uint16 royaltyBps)
        external
        payable
        returns (uint256 id)
    {
        if (!mintOpen) revert MintClosed();
        if (msg.value != mintPrice) revert WrongPrice();
        if (royaltyBps > MAX_ROYALTY_BPS) revert BadRoyalty();
        _validateTitle(bytes(title));
        (uint8 size, uint8 colors) = _validate(pxm);

        id = ++totalMinted;
        _ptr[id] = _write(pxm);
        works[id] = Work(msg.sender, uint40(block.timestamp), size, colors, royaltyBps);
        if (bytes(title).length != 0) _titles[id] = title;
        platformBalance += msg.value;
        _mint(msg.sender, id);
        emit Minted(id, msg.sender, keccak256(pxm));
    }

    /// @dev src/pxm.ts の validatePxm と同じ規則。通ったものは tokenURI で必ず描ける
    function _validate(bytes calldata d) internal pure returns (uint8 size, uint8 n) {
        if (d.length < 3 || d[0] != 0x01) revert BadData();
        size = uint8(d[1]);
        n = uint8(d[2]);
        if (size == 0 || size > MAX_SIZE || n == 0) revert BadData();
        uint256 p0 = 3 + 3 * uint256(n);
        if (d.length < p0 || (d.length - p0) & 1 == 1 || (d.length - p0) >> 1 > MAX_RUNS) revert BadData();
        uint256 x;
        uint256 y;
        unchecked {
            for (uint256 i = p0; i < d.length; i += 2) {
                uint256 len = uint8(d[i]);
                if (len == 0 || x + len > size || uint8(d[i + 1]) >= n || y >= size) revert BadData();
                x += len;
                if (x == size) {
                    x = 0;
                    ++y;
                }
            }
        }
        if (y != size || x != 0) revert BadData();
    }

    // ───────────────────────── 表示名 ─────────────────────────

    /// @notice 自分の表示名を設定する（空文字で消す）。ENS / Basename が無い作者向け
    function setName(string calldata name) external {
        if (bytes(name).length > MAX_NAME) revert BadTitle();
        _validateText(bytes(name));
        displayName[msg.sender] = name;
        emit NameSet(msg.sender, name);
    }

    /// @dev 制御文字（0x00-0x1f, 0x7f）を拒む。" と \ は tokenURI でエスケープする
    function _validateTitle(bytes calldata t) internal pure {
        if (t.length > MAX_TITLE) revert BadTitle();
        _validateText(t);
    }

    function _validateText(bytes calldata t) internal pure {
        for (uint256 i; i < t.length; ++i) {
            uint8 c = uint8(t[i]);
            if (c < 0x20 || c == 0x7f) revert BadTitle();
        }
    }

    // ───────────────────────── 読み出し ─────────────────────────

    /// @notice 保存されている生のピクセルデータ（PXM v1）
    function data(uint256 id) public view returns (bytes memory out) {
        _requireOwned(id);
        address p = _ptr[id];
        uint256 len = p.code.length - 1;
        out = new bytes(len);
        assembly {
            extcodecopy(p, add(out, 32), 1, len)
        }
    }

    /// @notice 作品の SVG（コントラクトが組み立てる）
    function svg(uint256 id) public view returns (string memory) {
        return string(PxmSvg.render(data(id)));
    }

    /// @notice 作品タイトル（未設定なら "pixmint #id"）
    function title(uint256 id) public view returns (string memory) {
        _requireOwned(id);
        string memory t = _titles[id];
        return bytes(t).length == 0 ? string.concat("pixmint #", id.toString()) : t;
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        Work memory w = works[id];
        string memory image = Base64.encode(bytes(svg(id)));
        string memory sz = uint256(w.size).toString();
        bytes memory json = abi.encodePacked(
            '{"name":"',
            _escape(bytes(title(id))),
            '","description":"Fully on-chain pixel art made with ',
            PLATFORM,
            '. The image is rendered by the contract from pixel data stored on-chain.",',
            '"external_url":"',
            siteURL,
            "/",
            block.chainid.toString(),
            "/",
            id.toString(),
            '","image":"data:image/svg+xml;base64,',
            image
        );
        json = abi.encodePacked(
            json,
            '","attributes":[{"trait_type":"Grid","value":"',
            sz,
            "x",
            sz,
            '"},{"trait_type":"Colors","value":',
            uint256(w.colors).toString(),
            '},{"trait_type":"Creator","value":"',
            Strings.toHexString(w.creator),
            '"},',
            _artistAttr(w.creator),
            '{"trait_type":"Storage","value":"Fully On-Chain"},{"trait_type":"Platform","value":"',
            PLATFORM,
            '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    /// @notice コレクション情報（OpenSea などが読む）
    function contractURI() external view returns (string memory) {
        bytes memory json = abi.encodePacked(
            '{"name":"pixmint","description":"Fully on-chain pixel art, drawn and minted with ',
            PLATFORM,
            '. Every image lives in the contract state and is rendered on-chain.","external_link":"',
            siteURL,
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    /// @dev 表示名があれば {"trait_type":"Artist","value":"…"}, を返す
    function _artistAttr(address creator) private view returns (bytes memory) {
        bytes memory n = bytes(displayName[creator]);
        if (n.length == 0) return "";
        return abi.encodePacked('{"trait_type":"Artist","value":"', _escape(n), '"},');
    }

    /// @dev JSON 文字列用に " と \ をエスケープ（制御文字は mint で拒んでいる）
    function _escape(bytes memory s) private pure returns (bytes memory out) {
        uint256 extra;
        for (uint256 i; i < s.length; ++i) if (s[i] == '"' || s[i] == "\\") ++extra;
        if (extra == 0) return s;
        out = new bytes(s.length + extra);
        uint256 j;
        for (uint256 i; i < s.length; ++i) {
            if (s[i] == '"' || s[i] == "\\") out[j++] = "\\";
            out[j++] = s[i];
        }
    }

    // ───────────────────────── ロイヤリティ（ERC-2981） ─────────────────────────
    // 外部マーケット向け。作者分だけを申告する（mederu 手数料は pixmint 内の販売でのみ取る）。

    function royaltyInfo(uint256 id, uint256 salePrice) external view returns (address, uint256) {
        Work memory w = works[id];
        return (w.creator, (salePrice * w.royaltyBps) / 10_000);
    }

    function supportsInterface(bytes4 iid) public view override returns (bool) {
        return iid == 0x2a55205a /* ERC-2981 */ || super.supportsInterface(iid);
    }

    // ───────────────────────── 販売（pixmint 内） ─────────────────────────
    // 内訳: mederu 手数料 feeBps ＋ 作者ロイヤリティ royaltyBps（作者自身が売るときは無し）＋ 残りが売り手

    function list(uint256 id, uint256 price) external {
        if (ownerOf(id) != msg.sender) revert NotTokenOwner();
        if (price == 0) revert WrongPrice();
        listings[id] = price;
        emit Listed(id, msg.sender, price);
    }

    function unlist(uint256 id) external {
        if (ownerOf(id) != msg.sender) revert NotTokenOwner();
        delete listings[id];
        emit Unlisted(id);
    }

    function buy(uint256 id) external payable nonReentrant {
        uint256 price = listings[id];
        if (price == 0) revert NotListed();
        if (msg.value != price) revert WrongPrice();
        address seller = ownerOf(id);
        Work memory w = works[id];

        uint256 fee = (price * feeBps) / 10_000;
        uint256 royalty = seller == w.creator ? 0 : (price * w.royaltyBps) / 10_000;

        _transfer(seller, msg.sender, id); // _update で出品は消える
        platformBalance += fee;
        if (royalty != 0) _pay(w.creator, royalty);
        _pay(seller, price - fee - royalty);
        emit Sold(id, seller, msg.sender, price);
    }

    /// @notice 送金に失敗して預かっている分を引き出す
    function claim() external nonReentrant {
        uint256 amt = pending[msg.sender];
        pending[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok);
    }

    function _pay(address to, uint256 amt) private {
        (bool ok, ) = to.call{value: amt}("");
        if (!ok) pending[to] += amt;
    }

    /// @dev 譲渡されたら出品を取り消す（前の持ち主の出品が残らないように）
    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        from = super._update(to, id, auth);
        if (from != address(0) && listings[id] != 0) {
            delete listings[id];
            emit Unlisted(id);
        }
    }

    // ───────────────────────── owner ─────────────────────────
    // 作品データには触れない。値段・手数料（上限5%）・受付の開閉・サイトURL・手数料の引き出しだけ。

    function setMintPrice(uint256 price) external onlyOwner {
        mintPrice = price;
    }

    function setFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert BadFee();
        feeBps = bps;
    }

    function setMintOpen(bool open) external onlyOwner {
        mintOpen = open;
    }

    function setSiteURL(string calldata url) external onlyOwner {
        siteURL = url;
    }

    /// @notice mederu の取り分（mint 手数料＋販売手数料）だけを引き出す。預かり金には触れない
    function withdraw(address payable to) external onlyOwner nonReentrant {
        uint256 amt = platformBalance;
        platformBalance = 0;
        (bool ok, ) = to.call{value: amt}("");
        require(ok);
    }

    // ───────────────────────── SSTORE2 ─────────────────────────

    /// @dev runtime code = 0x00(STOP) + data のコントラクトを作る。誰も実行できず、消す手段も無い
    function _write(bytes calldata d) private returns (address p) {
        bytes memory code = abi.encodePacked(hex"61", uint16(d.length + 1), hex"80600a3d393df300", d);
        assembly {
            p := create(0, add(code, 32), mload(code))
        }
        if (p == address(0)) revert BadData();
    }
}

/// @notice PXM v1 → SVG。src/pxm.ts の pxmToSvg と同じ文字列を返す
library PxmSvg {
    function render(bytes memory d) internal pure returns (bytes memory out) {
        uint256 size = uint8(d[1]);
        uint256 n = uint8(d[2]);
        uint256 p0 = 3 + 3 * n;
        uint256 runs = (d.length - p0) >> 1;

        // 色ごとにランを並べ替える（計数ソート。O(ラン数 + 色数)）
        uint256[] memory start = new uint256[](n + 1);
        uint256[] memory order = new uint256[](runs);
        unchecked {
            for (uint256 i; i < runs; ++i) ++start[uint8(d[p0 + 2 * i + 1]) + 1];
            for (uint256 c = 1; c <= n; ++c) start[c] += start[c - 1];
            uint256[] memory next = new uint256[](n);
            for (uint256 c; c < n; ++c) next[c] = start[c];
            uint256 x;
            uint256 y;
            for (uint256 i; i < runs; ++i) {
                uint256 len = uint8(d[p0 + 2 * i]);
                uint256 idx = uint8(d[p0 + 2 * i + 1]);
                order[next[idx]++] = x | (y << 8) | (len << 16);
                x += len;
                if (x == size) {
                    x = 0;
                    ++y;
                }
            }
        }

        // 1ランは最長 "M128 128h129v1h-129z" = 20 文字
        out = new bytes(220 + 40 * n + 20 * runs);
        uint256 o;
        assembly {
            o := add(out, 32)
        }
        o = _s(o, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ');
        o = _n(o, size);
        o = _s(o, " ");
        o = _n(o, size);
        o = _s(o, '" shape-rendering="crispEdges"><rect width="');
        o = _n(o, size);
        o = _s(o, '" height="');
        o = _n(o, size);
        o = _s(o, '" fill="#');
        o = _hex(o, d, 0);
        o = _s(o, '"/>');
        unchecked {
            for (uint256 c = 1; c < n; ++c) {
                uint256 a = start[c];
                uint256 b = start[c + 1];
                if (a == b) continue;
                o = _s(o, '<path fill="#');
                o = _hex(o, d, c);
                o = _s(o, '" d="');
                for (uint256 k = a; k < b; ++k) {
                    uint256 v = order[k];
                    uint256 len = v >> 16;
                    o = _c(o, 0x4d); // M
                    o = _n(o, v & 0xff);
                    o = _c(o, 0x20); // ' '
                    o = _n(o, (v >> 8) & 0xff);
                    o = _c(o, 0x68); // h
                    o = _n(o, len);
                    o = _s(o, "v1h-");
                    o = _n(o, len);
                    o = _c(o, 0x7a); // z
                }
                o = _s(o, '"/>');
            }
        }
        o = _s(o, "</svg>");
        assembly {
            mstore(out, sub(o, add(out, 32)))
        }
    }

    function _c(uint256 o, uint256 ch) private pure returns (uint256) {
        assembly {
            mstore8(o, ch)
        }
        return o + 1;
    }

    function _s(uint256 o, bytes memory s) private pure returns (uint256 r) {
        assembly {
            let len := mload(s)
            // 32バイト単位で写す（書きすぎた分は後で上書きされる。最後は mstore(out, len) で切る）
            for { let i := 0 } lt(i, len) { i := add(i, 32) } {
                mstore(add(o, i), mload(add(add(s, 32), i)))
            }
            r := add(o, len)
        }
    }

    /// @dev 0..255 を10進で
    function _n(uint256 o, uint256 v) private pure returns (uint256) {
        assembly {
            switch lt(v, 10)
            case 1 {
                mstore8(o, add(48, v))
                o := add(o, 1)
            }
            default {
                switch lt(v, 100)
                case 1 {
                    mstore8(o, add(48, div(v, 10)))
                    mstore8(add(o, 1), add(48, mod(v, 10)))
                    o := add(o, 2)
                }
                default {
                    mstore8(o, add(48, div(v, 100)))
                    mstore8(add(o, 1), add(48, mod(div(v, 10), 10)))
                    mstore8(add(o, 2), add(48, mod(v, 10)))
                    o := add(o, 3)
                }
            }
        }
        return o;
    }

    function _hex(uint256 o, bytes memory d, uint256 c) private pure returns (uint256) {
        bytes16 H = "0123456789abcdef";
        unchecked {
            for (uint256 k; k < 3; ++k) {
                uint8 b = uint8(d[3 + 3 * c + k]);
                assembly {
                    mstore8(o, byte(shr(4, b), H))
                    mstore8(add(o, 1), byte(and(b, 15), H))
                }
                o += 2;
            }
        }
        return o;
    }
}
