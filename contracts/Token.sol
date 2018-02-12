pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "zeppelin-solidity/contracts/token/ERC20/BurnableToken.sol";


contract Token is StandardToken, BurnableToken {
  string public name;
  string public symbol;
  uint8 public decimals;
  address public supplier;

  function Token(string _name, string _symbol, uint8 _decimals, uint256 _totalSupply) public {
    name = _name;
    symbol = _symbol;
    decimals = _decimals;
    supplier = msg.sender;

    totalSupply_ = _totalSupply;
    balances[supplier] = totalSupply_;
  }
}