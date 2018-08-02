/* global artifacts */

const Deploy = require("solidity-utils/helpers/Deployer");

const ERC20TokenGenerator = artifacts.require("./ERC20TokenGenerator.sol");

module.exports = async (deployer, network) => {
  if (network === "develop") return;

  const deploy = Deploy(deployer, network);

  // --> generator
  await deploy(ERC20TokenGenerator);
};
