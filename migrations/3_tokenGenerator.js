const Deploy = require("../utils/Deploy");
const TokenGenerator = artifacts.require("./TokenGenerator.sol");

module.exports = async (deployer, network, accounts) => {
  if (network === "develop") return;

  const deploy = Deploy(deployer, network);

  // --> generator
  const generator = await deploy(TokenGenerator);
};
