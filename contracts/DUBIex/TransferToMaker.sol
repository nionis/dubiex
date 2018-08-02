pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";
import "./Types.sol";


library TransferToMaker {
  using SafeERC20 for ERC20;

  function ethereum(Types.Item memory makerItem, Types.Item memory takerItem) private {
    makerItem.owner.transfer(takerItem.value);
  }

  function erc20(Types.Item memory makerItem, Types.Item memory takerItem) private {
    ERC20(takerItem.contractAddress).safeTransferFrom(takerItem.owner, makerItem.owner, takerItem.value);
  }

  function erc721(Types.Item memory makerItem, Types.Item memory takerItem) private {
    ERC721(takerItem.contractAddress).safeTransferFrom(takerItem.owner, makerItem.owner, takerItem.value);
  }

  function transfer(Types.Item memory makerItem, Types.Item memory takerItem) internal {
    if (takerItem.currencyType == Types.CurrencyType.ETHEREUM) ethereum(makerItem, takerItem);
    else if (takerItem.currencyType == Types.CurrencyType.ERC20) erc20(makerItem, takerItem);
    else if (takerItem.currencyType == Types.CurrencyType.ERC721) erc721(makerItem, takerItem);
    else {
      revert("currencyType does not exist");
    }
  }
}