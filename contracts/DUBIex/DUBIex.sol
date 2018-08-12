pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721Holder.sol";
import "openzeppelin-solidity/contracts/ReentrancyGuard.sol";
import "./Types.sol";
import "./IsApproved.sol";
import "./Claim.sol";
import "./TransferToMaker.sol";
import "./TransferToTaker.sol";


contract DUBIex is ReentrancyGuard, ERC721Holder {
  using SafeMath for uint256;
  using IsApproved for Types.Item;
  using Claim for Types.Item;

  event MadeOrder(
    uint256 id,
    uint256 makerValue,
    uint256 takerValue,
    address indexed maker,
    address indexed makerContractAddress,
    address indexed takerContractAddress,
    Types.CurrencyType makerCurrencyType,
    Types.CurrencyType takerCurrencyType
  );

  event TookOrder(uint256 indexed id, address indexed taker, uint256 makerValue, uint256 takerValue);
  
  event CanceledOrder(uint256 indexed id);

  // id -> Order
  mapping(uint256 => Types.Order) private orderBook;

  // weiSend of current transaction
  uint256 private weiSend = 0;

  // makes sure weiSend is updated for each new transaction
  modifier updateWeiSend() {
    weiSend = msg.value;
    _;
  }

  // decreases weiSend within current transaction
  function decreaseWeiSend(uint256 amount) private {
    weiSend = weiSend.sub(amount);
  }

  // sends back remaining Wei received from current transaction
  function transferBackRemainingWei() private {
    if (weiSend > 0) msg.sender.transfer(weiSend);
  }

  // returns order
  function getOrder(uint256 id) external view returns (
    uint256,
    uint256,
    uint256,
    address,
    address,
    Types.CurrencyType,
    Types.CurrencyType
  ) {
    Types.Order storage order = orderBook[id];

    return (
      order.id,
      order.makerItem.value,
      order.takerItem.value,
      order.makerItem.contractAddress,
      order.takerItem.contractAddress,
      order.makerItem.currencyType,
      order.takerItem.currencyType
    );
  }

  // makes sure item created has correct ethereum address
  function createItem(
    uint256 value,
    address contractAddress,
    address owner,
    Types.CurrencyType currencyType
  ) internal returns (Types.Item) {
    if (currencyType == Types.CurrencyType.ETHEREUM) contractAddress = address(0);

    return Types.Item(value, contractAddress, owner, currencyType);
  }

  function calculateValues(
    Types.Order memory order,
    uint256 makerValue,
    uint256 takerValue
  ) private pure returns (uint256, uint256) {
    if (order.makerItem.currencyType == Types.CurrencyType.ERC721) {
      // if buying ERC721, takerValue must be what maker requested for a price
      if (takerValue != order.takerItem.value) takerValue = 0;
    } else if (order.takerItem.currencyType == Types.CurrencyType.ERC721) {
      // if selling ERC721, takerValue must be what maker requested for a price
      if (takerValue != order.takerItem.value) takerValue = 0;
    } else {
      // if takerValue should not be larger than makers request
      if (takerValue > order.takerItem.value) {
        takerValue = order.takerItem.value;
      }

      // calculate makerValue to withdraw
      makerValue = makerValue
        .mul(1 ether)
        .div(order.takerItem.value)
        .mul(takerValue)
        .div(1 ether);
    }

    return (
      makerValue,
      takerValue
    );
  }

  function makeOrderInternal(
    uint256 id,
    uint256 makerValue,
    uint256 takerValue,
    address makerContractAddress,
    address takerContractAddress,
    Types.CurrencyType makerCurrencyType,
    Types.CurrencyType takerCurrencyType
  ) internal returns (bool) {
    if (
      id <= 0 || // invalid id
      id == orderBook[id].id || // id already exists
      makerValue <= 0 || // makerValue is 0
      takerValue <= 0 // takerValue is 0
    ) return false;

    // create makerItem
    Types.Item memory makerItem = createItem(makerValue, makerContractAddress, msg.sender, makerCurrencyType);

    // check if we can receive makerItem successfuly
    bool isOk = makerItem.isApproved(weiSend);
    if (!isOk) return false;

    // decrease weiSend
    if (makerItem.currencyType == Types.CurrencyType.ETHEREUM) { 
      decreaseWeiSend(makerValue);
    }

    // claim item
    makerItem.claim();

    // update orders
    orderBook[id] = Types.Order(
      id,
      makerItem,
      createItem(takerValue, takerContractAddress, address(0x0), takerCurrencyType)
    );

    emit MadeOrder(
      id,
      makerValue,
      takerValue,
      msg.sender,
      makerContractAddress,
      takerContractAddress,
      makerCurrencyType,
      takerCurrencyType
    );

    return true;
  }

  function takeOrderInternal(
    uint256 id,
    uint256 takerValue
  ) internal returns (bool) {
    if (
      id <= 0 || // invalid id
      id != orderBook[id].id || // id does not exist
      takerValue <= 0 // takerValue is 0
    ) return false;

    Types.Order storage order = orderBook[id];
    uint256 makerValue = order.makerItem.value;

    (makerValue, takerValue) = calculateValues(order, makerValue, takerValue);
    if (takerValue == 0 || makerValue == 0) return false;

    // create makerItem
    Types.Item memory makerItem = createItem(
      makerValue,
      order.makerItem.contractAddress,
      order.makerItem.owner,
      order.makerItem.currencyType
    );
    // create takerItem
    Types.Item memory takerItem = createItem(
      takerValue,
      order.takerItem.contractAddress,
      msg.sender,
      order.takerItem.currencyType
    );

    // check if we can receive takerItem successfuly
    bool isOk = takerItem.isApproved(weiSend);
    if (!isOk) return false;

    // decrease weiSend
    if (takerItem.currencyType == Types.CurrencyType.ETHEREUM) { 
      decreaseWeiSend(takerValue);
    }

    TransferToMaker.transfer(makerItem, takerItem);
    TransferToTaker.transfer(makerItem, takerItem);

    order.makerItem.value = order.makerItem.value.sub(makerValue);
    order.takerItem.value = order.takerItem.value.sub(takerValue);

    emit TookOrder(
      id,
      msg.sender,
      makerValue,
      takerValue
    );

    return true;
  }

  function cancelOrderInternal(
    uint256 id
  ) internal returns (bool) {
    if (
      id <= 0 || // invalid id
      id != orderBook[id].id || // id does not exist
      orderBook[id].makerItem.owner != msg.sender // sender is not the maker of the order
    ) return false;

    // get order
    Types.Order storage order = orderBook[id];

    // maker becomes taker
    TransferToTaker.transfer(order.makerItem, order.makerItem);

    // update items
    order.makerItem.value = 0;
    order.takerItem.value = 0;

    emit CanceledOrder(id);

    return true;
  }

  // single
  function makeOrder(
    uint256 id,
    uint256 makerValue,
    uint256 takerValue,
    address makerContractAddress,
    address takerContractAddress,
    Types.CurrencyType makerCurrencyType,
    Types.CurrencyType takerCurrencyType
  ) external payable updateWeiSend nonReentrant returns (bool) {
    bool success = makeOrderInternal(
      id,
      makerValue,
      takerValue,
      makerContractAddress,
      takerContractAddress,
      makerCurrencyType,
      takerCurrencyType
    );

    transferBackRemainingWei();

    return success;
  }

  function takeOrder(
    uint256 id,
    uint256 takerValue
  ) external payable updateWeiSend nonReentrant returns (bool) {
    bool success = takeOrderInternal(
      id,
      takerValue
    );

    transferBackRemainingWei();

    return success;
  }

  function cancelOrder(
    uint256 id
  ) external nonReentrant returns (bool) {
    return cancelOrderInternal(id);
  }

  // multi
  function makeOrders(
    uint256[] ids,
    uint256[] makerValues,
    uint256[] takerValues,
    address[] makerContractAddresses,
    address[] takerContractAddresses,
    Types.CurrencyType[] makerCurrencyTypes,
    Types.CurrencyType[] takerCurrencyTypes
  ) external payable updateWeiSend nonReentrant {
    for (uint256 i = 0; i < ids.length; i++) {
      makeOrderInternal(
        ids[i],
        makerValues[i],
        takerValues[i],
        makerContractAddresses[i],
        takerContractAddresses[i],
        makerCurrencyTypes[i],
        takerCurrencyTypes[i]
      );
    }

    transferBackRemainingWei();
  }

  function takeOrders(
    uint256[] ids,
    uint256[] takerValues
  ) external payable updateWeiSend nonReentrant {
    for (uint256 i = 0; i < ids.length; i++) {
      takeOrderInternal(ids[i], takerValues[i]);
    }

    transferBackRemainingWei();
  }

  function cancelOrders(
    uint256[] ids
  ) external nonReentrant {
    for (uint256 i = 0; i < ids.length; i++) {
      cancelOrderInternal(ids[i]);
    }
  }
}