pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "./Token.sol";


contract TokenGenerator {
  using SafeMath for uint256;

  // dubi holders address
  address public constant dubiHolders = 0xd93C8bF051EC9816835d89E0C72d1FFbAe7aE4a9;

  // logs
  event LogAddress (string item, address addr);

  function generate(string _name, string _symbol, uint8 _decimals, uint256 _supply, address _user) external {
    // calculate dubi extra amount
    uint256 dubiHoldersAmount = _supply.mul(10).div(100);
    uint256 _totalSupply = _supply.add(dubiHoldersAmount);

    // create token
    Token token = new Token(_name, _symbol, _decimals, _totalSupply);

    // give tokens to user and dubiHolders
    token.transfer(_user, _supply);
    token.transfer(dubiHolders, dubiHoldersAmount);

    // log new token address
    LogAddress("token", address(token));
  }
}