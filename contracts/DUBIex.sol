pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "zeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import "./Utils.sol";


contract DUBIex is ReentrancyGuard {
  using SafeMath for uint256;
  using SafeERC20 for ERC20;
  
  // order
  struct Order {
    uint256 id;
    address maker;
    uint256 amount;
    address pairA;
    address pairB;
    uint256 priceA;
    uint256 priceB;
  }

  // order id -> order
  mapping(uint256 => Order) public orders;

  // weiSend of current tx
  uint256 private weiSend = 0;

  // makes sure weiSend of current tx is reset
  modifier weiSendGuard() {
    weiSend = msg.value;
    _;
    weiSend = 0;
  }

  // logs
  event LogMakeOrder(uint256 id, address indexed maker, uint256 amount, address indexed pairA, address indexed pairB, uint256 priceA, uint256 priceB);
  event LogTakeOrder(uint256 indexed id, address indexed taker, uint256 amount);
  event LogCancelOrder(uint256 indexed id);

  // internal
  function _makeOrder(uint256 id, uint256 amount, address pairA, address pairB, uint256 priceA, uint256 priceB, address maker) internal returns (bool) {
    // validate input
    if (
      id <= 0 ||
      amount <= 0 ||
      pairA == pairB ||
      priceA <= 0 ||
      priceB <= 0 ||
      orders[id].id == id
    ) return false;

    bool pairAisEther = Utils.isEther(pairA);
    ERC20 tokenA = ERC20(pairA);

    // validate maker's deposit
    if (pairAisEther && (weiSend <= 0 || weiSend < amount)) return false;
    else if (!pairAisEther && (tokenA.allowance(maker, this) < amount || tokenA.balanceOf(maker) < amount)) return false;

    // update state
    orders[id] = Order(id, maker, amount, pairA, pairB, priceA, priceB);

    // retrieve makers amount
    if (pairAisEther) {
      // eth already received, subtract used wei
      weiSend = weiSend.sub(amount);
    } else {
      // pull tokens
      tokenA.safeTransferFrom(maker, this, amount);
    }

    LogMakeOrder(id, maker, amount, pairA, pairB, priceA, priceB);

    return true;
  }

  function _takeOrder(uint256 id, uint256 amount, address taker) internal returns (bool) {
    // validate inputs
    if (
      id <= 0 ||
      amount <= 0
    ) return false;
    
    // get order
    Order storage order = orders[id];
    // validate order
    if (order.id != id) return false;
    
    bool pairAisEther = Utils.isEther(order.pairA);
    bool pairBisEther = Utils.isEther(order.pairB);
    // amount of pairA usable
    uint256 usableAmount = amount > order.amount ? order.amount : amount;
    // amount of pairB maker will receive
    uint256 totalB = usableAmount.mul(order.priceB).div(order.priceA);

    // token interfaces
    ERC20 tokenA = ERC20(order.pairA);
    ERC20 tokenB = ERC20(order.pairB);

    // validate taker's deposit
    if (pairBisEther && (weiSend <= 0 || weiSend < totalB)) return false;
    else if (!pairBisEther && (tokenB.allowance(taker, this) < totalB || tokenB.balanceOf(taker) < amount)) return false;

    // update state
    order.amount = order.amount.sub(usableAmount);

    // pay maker
    if (pairBisEther) {
      weiSend = weiSend.sub(totalB);
      order.maker.transfer(totalB);
    } else {
      tokenB.safeTransferFrom(taker, order.maker, totalB);
    }

    // pay taker
    if (pairAisEther) {
      taker.transfer(usableAmount);
    } else {
      tokenA.safeTransfer(taker, usableAmount);
    }

    LogTakeOrder(id, taker, usableAmount);

    return true;
  }

  function _cancelOrder(uint256 id, address maker) internal returns (bool) {
    // validate inputs
    if (id <= 0) return false;

    // get order
    Order storage order = orders[id];
    if (
      order.id != id ||
      order.maker != maker
    ) return false;

    uint256 amount = order.amount;
    bool pairAisEther = Utils.isEther(order.pairA);

    // update state
    order.amount = 0;

    // actions
    if (pairAisEther) {
      order.maker.transfer(amount);
    } else {
      ERC20(order.pairA).safeTransfer(order.maker, amount);
    }

    LogCancelOrder(id);

    return true;
  }

  // single
  function makeOrder(uint256 id, uint256 amount, address pairA, address pairB, uint256 priceA, uint256 priceB) external payable weiSendGuard nonReentrant returns (bool) {
    bool success = _makeOrder(id, amount, pairA, pairB, priceA, priceB, msg.sender);

    if (weiSend > 0) msg.sender.transfer(weiSend);

    return success;
  }

  function takeOrder(uint256 id, uint256 amount) external payable weiSendGuard nonReentrant returns (bool) {
    bool success = _takeOrder(id, amount, msg.sender);

    if (weiSend > 0) msg.sender.transfer(weiSend);

    return success;
  }

  function cancelOrder(uint256 id) external nonReentrant returns (bool) {
    return _cancelOrder(id, msg.sender);
  }

  // multi
  function makeOrders(uint256[] ids, uint256[] amounts, address[] pairAs, address[] pairBs, uint256[] priceAs, uint256[] priceBs) external payable weiSendGuard nonReentrant returns (bool) {
    require(
      amounts.length == ids.length &&
      pairAs.length == ids.length &&
      pairBs.length == ids.length &&
      priceAs.length == ids.length &&
      priceBs.length == ids.length
    );

    bool allSuccess = true;

    for (uint256 i = 0; i < ids.length; i++) {
      // update if any of the orders failed
      // the function is like this because "stack too deep" error
      if (allSuccess && !_makeOrder(ids[i], amounts[i], pairAs[i], pairBs[i], priceAs[i], priceBs[i], msg.sender)) allSuccess = false;
    }

    if (weiSend > 0) msg.sender.transfer(weiSend);

    return allSuccess;
  }

  function takeOrders(uint256[] ids, uint256[] amounts) external payable weiSendGuard nonReentrant returns (bool) {
    require(ids.length == amounts.length);

    bool allSuccess = true;

    for (uint256 i = 0; i < ids.length; i++) {
      bool success = _takeOrder(ids[i], amounts[i], msg.sender);

      // update if any of the orders failed
      if (allSuccess && !success) allSuccess = success;
    }

    if (weiSend > 0) msg.sender.transfer(weiSend);

    return allSuccess;
  }

  function cancelOrders(uint256[] ids) external nonReentrant returns (bool) {
    bool allSuccess = true;

    for (uint256 i = 0; i < ids.length; i++) {
      bool success = _cancelOrder(ids[i], msg.sender);

      // update if any of the orders failed
      if (allSuccess && !success) allSuccess = success;
    }

    return allSuccess;
  }
}