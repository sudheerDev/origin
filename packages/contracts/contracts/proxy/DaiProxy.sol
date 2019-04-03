pragma solidity ^0.4.24;

import "../../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";

/**
 * @title DaiProxy
 * Proxy contract to simplify making offers with DAI
 */
contract DaiProxy is Ownable {

    address public marketplaceAddress;
    address public daiAddress;
    address public uniswapAddress;

    constructor(address _marketplaceAddress, address _daiAddress, address _uniswapExchangeAddress) public {
        owner = msg.sender;

        setMarketplaceAddress(_marketplaceAddress);
        setDaiAddress(_daiAddress);
        setUniswapAddress(_uniswapExchangeAddress);
    }

    // Set address of Origin Marketplace contract
    function setMarketplaceAddress(address _marketplaceAddress) public onlyOwner {
        marketplaceAddress = _marketplaceAddress;
    }

    // Set address of DAI token contract
    function setDaiAddress(address _daiAddress) public onlyOwner {
        daiAddress = _daiAddress;
    }

    // Set address of Uniswap Exchange contract
    function setUniswapAddress(address _uniswapAddress) public onlyOwner {
        uniswapAddress = _uniswapAddress;
    }

    // @dev Make buy offer with DAI.
    function makeOfferWithDai(
        uint256 tokensBought, // Amount of DAI tokens to buy
        uint256 listingID,
        bytes32 _ipfsHash,   // IPFS hash containing offer data
        uint256 _finalizes,     // Timestamp an accepted offer will finalize
        address _affiliate,  // Address to send any required commission to
        uint256 _commission, // Amount of commission to send in Origin Token if offer finalizes
        uint256 _value,         // Offer amount in ERC20 or Eth
        address _arbitrator  // Escrow arbitrator
    )
        public
        payable
    {
        uniswapAddress.delegatecall(
            bytes4(keccak256("ethToTokenSwapOutput(uint256,uint256)")),
            tokensBought,
            block.timestamp + 5 minutes
        );

        daiAddress.delegatecall(
            bytes4(keccak256("approve(address,uint256)")),
            marketplaceAddress,
            tokensBought
        );

        marketplaceAddress.delegatecall(
            bytes4(keccak256("makeOffer(uint256,bytes32,uint256,address,uint256,uint256,address,address)")),
            listingID,
            _ipfsHash,
            _finalizes,
            _affiliate,
            _commission,
            _value,
            daiAddress,
            _arbitrator
        );
    }

    // @dev Make new offer after withdrawl
    function makeOfferWithDai(
        uint256 tokensBought, // Amount of DAI tokens to buy
        uint listingID,
        bytes32 _ipfsHash,
        uint _finalizes,
        address _affiliate,
        uint256 _commission,
        uint _value,
        address _arbitrator,
        uint _withdrawOfferID
    )
        public
        payable
    {
        makeOfferWithDai(
            tokensBought,
            listingID,
            _ipfsHash,
            _finalizes,
            _affiliate,
            _commission,
            _value,
            _arbitrator
        );
    }
}