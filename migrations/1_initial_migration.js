const Deploy = require("../utils/Deploy");
const Migrations = artifacts.require("./Migrations.sol");

module.exports = async (deployer, network, accounts) => {
  if (network === "develop") return;

  const deploy = Deploy(deployer, network);

  // --> migrations
  const migrations = await deploy(Migrations);
};
