/* global artifacts contract web3 assert */

const ERC20TokenGenerator = artifacts.require("./erc20/ERC20TokenGenerator.sol");
const Token = artifacts.require("./erc20/CustomERC20Token.sol");

contract("ERC20TokenGenerator", accounts => {
  const [user] = accounts;
  let generator;

  beforeEach(async () => {
    generator = await ERC20TokenGenerator.new();
  });

  it("generate token", async () => {
    const supply = new web3.BigNumber(1e27);
    const { logs } = await generator.generate("Token", "T", 18, supply, user);

    const TokenGeneratedEvent = logs.find(log => log.event === "TokenGenerated");
    assert.isTrue(!!TokenGeneratedEvent);

    const { tokenAddress } = TokenGeneratedEvent.args;
    const token = Token.at(tokenAddress);
    const dubiHolders = await generator.DUBI_HOLDERS();

    const balanceOfGenerator = await token.balanceOf(generator.address);
    const balanceOfUser = await token.balanceOf(user);
    const balanceOfDubiHolders = await token.balanceOf(dubiHolders);
    const totalSupply = await token.totalSupply();
    const dubiHoldersAmount = supply.times(10).div(100);

    assert.isTrue(balanceOfGenerator.equals(0));
    assert.isTrue(balanceOfUser.equals(supply));
    assert.isTrue(balanceOfDubiHolders.equals(dubiHoldersAmount));
    assert.isTrue(balanceOfUser.plus(balanceOfDubiHolders).equals(totalSupply));
  });
});
