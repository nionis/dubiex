require('babel-register')({ ignore: /node_modules\/(?!openzeppelin-solidity\/test\/helpers)/ });
require('babel-polyfill');
const path = require("path");
const fs = require("fs");
const HDWalletProvider = require("truffle-hdwallet-provider");

let networks = {
  develop: {
    host: "127.0.0.1",
    port: 9545,
    network_id: "*",
  },
};

if (fs.existsSync(path.join(__dirname, "keys.js"))) {
  const Keys = require("./keys"); // eslint-disable-line global-require, import/no-unresolved
  const rinkebyKeys = Keys("rinkeby");
  const mainnetKeys = Keys("mainnet");

  networks = Object.assign(networks, {
    rinkeby: {
      provider: new HDWalletProvider(
        rinkebyKeys.mnemonic,
        `https://rinkeby.infura.io/${rinkebyKeys.infuraKey}`,
      ),
      network_id: 4,
    },
    mainnet: {
      provider: new HDWalletProvider(
        mainnetKeys.mnemonic,
        `https://mainnet.infura.io/${mainnetKeys.infuraKey}`,
      ),
      gas: "7000000",
      gasPrice: "20000000000",
      network_id: 1,
    },
  });
}

module.exports = {
  networks,
  solc: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
};
