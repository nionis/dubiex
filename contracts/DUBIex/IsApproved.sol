pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";
import "./Types.sol";


library IsApproved {
  function ethereum(Types.Item memory item, uint256 weiRemaining) private pure returns (bool) {
    if (item.value > weiRemaining) return false;
    // receiving ethereum, amount not enough

    return true;
  }

  function erc20(Types.Item memory item) private view returns (bool) {
    uint256 allowedAmount = ERC20(item.contractAddress).allowance(item.owner, this);
    if (item.value > allowedAmount) return false;
    // receiving erc20, amount not enough

    return true;
  }

  function erc721(Types.Item memory item) private view returns (bool) {
    address approved = ERC721(item.contractAddress).getApproved(item.value);
    if (approved != address(this)) return false;
    // receiving erc721, not approved

    return true;
  }

  function isApproved(Types.Item memory item, uint256 weiRemaining) internal view returns (bool) {
    if (item.currencyType == Types.CurrencyType.ETHEREUM) return ethereum(item, weiRemaining);
    else if (item.currencyType == Types.CurrencyType.ERC20) return erc20(item);
    else if (item.currencyType == Types.CurrencyType.ERC721) return erc721(item);

    return false;
  }
}