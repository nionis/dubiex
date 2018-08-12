/* global artifacts web3 */
/* eslint-disable max-len  */

const repl = require("repl");
const increaseTime = require("openzeppelin-solidity/test/helpers/increaseTime").default;
const { duration } = require("openzeppelin-solidity/test/helpers/increaseTime");
const sequential = require("promise-sequential");
const { generateOrders, ethereumAddress } = require("../test/utils");

// load contracts
const DUBIex = artifacts.require("DUBIex");
const ERC20Token = artifacts.require("./erc20/CustomERC20Token.sol");
const ERC721Token = artifacts.require("./erc721/CustomERC721Token.sol");

// make web3 available globally
global.web3 = web3;

// get accounts promise
const getAccounts = () =>
  new Promise((resolve, reject) => {
    web3.eth.getAccounts((err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
  });

const RandomId = () => Math.floor(Math.random() * 1e18);

module.exports = async () => {
  const accounts = await getAccounts();
  const [owner, userA, userB] = accounts;

  const dubiex = await DUBIex.new({ gas: 6000000 });
  const erc20UserA = await ERC20Token.new("erc20UserA", "", 1e18, 1e27, { from: userA });
  const erc20UserB = await ERC20Token.new("erc20UserB", "", 1e18, 1e27, { from: userB });
  const erc721UserA = await ERC721Token.new("erc721UserA", "", { from: userA });
  const erc721UserB = await ERC721Token.new("erc721UserB", "", { from: userB });
  const orders = generateOrders({
    userA,
    userB,
    erc20UserA,
    erc20UserB,
    erc721UserA,
    erc721UserB,
  });

  // approve dubiex
  await erc20UserA.approve(dubiex.address, "1e27", { from: userA });
  await erc20UserB.approve(dubiex.address, "1e27", { from: userB });

  // mint erc721 and approve
  // const erc721Id1 = RandomId();
  // await erc721UserA.mint(userA, erc721Id1, { from: userA });
  // await erc721UserA.approve(dubiex.address, erc721Id1, { from: userA });
  // const erc721Id2 = RandomId();
  // await erc721UserB.mint(userB, erc721Id2, { from: userB });
  // await erc721UserB.approve(dubiex.address, erc721Id2, { from: userB });

  const playStory = Story => {
    return sequential(Story());
  };

  const Story1 = () => {
    const id1 = RandomId();
    const id2 = RandomId();
    const id3 = RandomId();
    const id4 = RandomId();
    // const id5 = erc721Id1;
    // const id6 = erc721Id2;

    return [
      // MAKE: 0-1  (1)
      () =>
        dubiex.makeOrder(id1, 100, 200, ethereumAddress, erc20UserB.address, 0, 1, {
          from: userA,
          value: 100,
        }),
      () => increaseTime(duration.minutes(10)),

      // TAKE: 0-1  (1)
      () => dubiex.takeOrder(id1, 50, { from: userB }),
      () => increaseTime(duration.minutes(10)),

      // MAKE: 1-1  (3)
      () =>
        dubiex.makeOrder(id3, 100, 200, erc20UserA.address, erc20UserB.address, 1, 1, { from: userA }),
      () => increaseTime(duration.minutes(10)),

      // TAKE: 1-1  (3)
      () => dubiex.takeOrder(id3, 50, { from: userB }),
      () => increaseTime(duration.minutes(10)),

      // MAKE: 0-1  (2)
      () =>
        dubiex.makeOrder(id2, 500, 250, erc20UserB.address, ethereumAddress, 1, 0, { from: userB }),
      () => increaseTime(duration.minutes(10)),

      // TAKE: 0-1  (2)
      () => dubiex.takeOrder(id2, 50, { from: userA, value: 50 }),
      () => increaseTime(duration.minutes(10)),

      // MAKE: 1-1  (4)
      () =>
        dubiex.makeOrder(id4, 500, 250, erc20UserB.address, erc20UserA.address, 1, 1, { from: userB }),
      () => increaseTime(duration.minutes(10)),

      // TAKE: 1-1  (4)
      () => dubiex.takeOrder(id4, 50, { from: userA }),
      () => increaseTime(duration.weeks(1)),
    ];
  };

  repl.start({ prompt: "> " });

  repl.context = {
    web3,
    owner,
    userA,
    userB,
    dubiex,
    erc20UserA,
    erc20UserB,
    erc721UserA,
    erc721UserB,
    orders,
    Story1,
    playStory,
  };
};
