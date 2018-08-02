pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/token/ERC20/BurnableToken.sol";


contract CustomERC20Token is StandardToken, BurnableToken {
  string public name;
  string public symbol;
  uint8 public decimals;
  address public supplier;

  constructor(string _name, string _symbol, uint8 _decimals, uint256 _totalSupply) public {
    name = _name;
    symbol = _symbol;
    decimals = _decimals;
    supplier = msg.sender;

    totalSupply_ = _totalSupply;
    balances[supplier] = totalSupply_;
  }
}