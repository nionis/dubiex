/* global artifacts */

const Deploy = require("solidity-utils/helpers/Deployer");

const Migrations = artifacts.require("./Migrations.sol");

module.exports = async (deployer, network) => {
  if (network === "develop") return;

  const deploy = Deploy(deployer, network);

  // --> migrations
  await deploy(Migrations);
};
