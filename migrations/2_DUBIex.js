const Deploy = require("../utils/Deploy");
const DUBIex = artifacts.require("./DUBIex.sol");

module.exports = async (deployer, network, accounts) => {
  if (network === "develop") return;

  const deploy = Deploy(deployer, network);

  // --> dubiex
  const dubiex = await deploy(DUBIex);
};
