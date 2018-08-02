pragma solidity 0.4.24;


library Types {
  // currency types
  enum CurrencyType {
    ETHEREUM,
    ERC20,
    ERC721
  }

  // an item that is put on for a trade
  struct Item {
    uint256 value; // id or amount
    address contractAddress;
    address owner;
    CurrencyType currencyType;
  }

  // order schema
  struct Order {
    uint256 id;
    Item makerItem;
    Item takerItem;
  }
}