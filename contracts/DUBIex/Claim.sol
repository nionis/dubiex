pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";
import "./Types.sol";


library Claim {
  using SafeMath for uint256;
  using SafeERC20 for ERC20;

  function ethereum() private pure {
    /* ether should have been sent by msg.value */
  }

  function erc20(Types.Item memory item) private {
    ERC20(item.contractAddress).safeTransferFrom(item.owner, this, item.value);
  }

  function erc721(Types.Item memory item) private {
    ERC721(item.contractAddress).safeTransferFrom(item.owner, this, item.value);
  }

  function claim(Types.Item memory item) internal {
    if (item.currencyType == Types.CurrencyType.ETHEREUM) ethereum();
    else if (item.currencyType == Types.CurrencyType.ERC20) erc20(item);
    else if (item.currencyType == Types.CurrencyType.ERC721) erc721(item);
    else {
      revert("currencyType does not exist");
    }
  }
}