const TokenGenerator = artifacts.require("TokenGenerator");
const Token = artifacts.require("Token");
const logParser = require("../utils/logParser");
const dubiHolders = "0xd93C8bF051EC9816835d89E0C72d1FFbAe7aE4a9";

contract("TokenGenerator", function(accounts) {
  const [owner, user] = accounts;
  let generator;

  beforeEach(async function() {
    generator = await TokenGenerator.new();
  });

  it("generate token", async function() {
    const supply = new web3.BigNumber(1e27);
    const tx = await generator.generate("Token", "T", 18, supply, user);
    const receipt = await web3.eth.getTransactionReceipt(tx.tx);
    const [, , log] = logParser(receipt.logs, TokenGenerator._json.abi);
    const tokenAddr = log.args.addr;

    const token = Token.at(tokenAddr);
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
