pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract CustomERC721Token is ERC721Token, Ownable {
  constructor(string _name, string _symbol)
  public
  ERC721Token(_name, _symbol) {}

  function mint(address to, uint256 tokenId) external onlyOwner {
    _mint(to, tokenId);
  }
}