/* global artifacts contract assert web3 */

const DUBIex = artifacts.require("./DUBIex.sol");
const ERC20Token = artifacts.require("./erc20/CustomERC20Token.sol");
const ERC721Token = artifacts.require("./erc721/CustomERC721Token.sol");
const BigNumber = require("bignumber.js");
// const expectThrow = require("openzeppelin-solidity/test/helpers/expectThrow");

const {
  ethereumAddress,
  currencyTypes,
  generateOrders,
  fundOrderWithWei,
  cloneOrder,
  calculateValues,
} = require("./utils");

contract("DUBIex", accounts => {
  const [, userA, userB] = accounts;

  // contracts
  let dubiex = {};
  let erc20UserA = {};
  let erc20UserB = {};
  let erc721UserA = {};
  let erc721UserB = {};
  let orders = [];

  const getBalance = async address => {
    return {
      [ethereumAddress]: await web3.eth.getBalance(address),
      [erc20UserA.address]: await erc20UserA.balanceOf(address),
      [erc20UserB.address]: await erc20UserB.balanceOf(address),
      [erc721UserA.address]: await erc721UserA.balanceOf(address),
      [erc721UserB.address]: await erc721UserB.balanceOf(address),
    };
  };

  const getBalances = async () => {
    return {
      [dubiex.address]: await getBalance(dubiex.address),
      [userA]: await getBalance(userA),
      [userB]: await getBalance(userB),
    };
  };

  const approveItem = async (item, value, user) => {
    if (item.currencyType === currencyTypes.ETHEREUM) {
      return true;
    } else if (item.currencyType === currencyTypes.ERC20) {
      const erc20Token = ERC20Token.at(item.contractAddress);

      return erc20Token.approve(dubiex.address, value, { from: user });
    } else if (item.currencyType === currencyTypes.ERC721) {
      const erc721Token = ERC721Token.at(item.contractAddress);
      await erc721Token.mint(user, value, { from: user });

      return erc721Token.approve(dubiex.address, value, { from: user });
    }
  };

  const assertOrder = async order => {
    const remoteOrder = await dubiex.getOrder(order.id).then(result => ({
      id: result[0],
      makerValue: result[1],
      takerValue: result[2],
      makerContractAddress: result[3],
      takerContractAddress: result[4],
      makerCurrencyType: result[5],
      takerCurrencyType: result[6],
    }));

    assert.isTrue(remoteOrder.id.equals(order.id), "wrong order.id");
    assert.isTrue(remoteOrder.makerValue.equals(order.makerItem.value), "wrong makerItem.value");
    assert.isTrue(remoteOrder.takerValue.equals(order.takerItem.value), "wrong takerItem.value");
    assert.equal(
      remoteOrder.makerContractAddress,
      order.makerItem.contractAddress,
      "wrong order.makerItem.",
    );
    assert.equal(
      remoteOrder.takerContractAddress,
      order.takerItem.contractAddress,
      "wrong order.takerItem.",
    );
    assert.isTrue(
      remoteOrder.makerCurrencyType.equals(order.makerItem.currencyType),
      "wrong makerItem.currencyType",
    );
    assert.isTrue(
      remoteOrder.takerCurrencyType.equals(order.takerItem.currencyType),
      "wrong takerItem.currencyType",
    );
  };

  const assertMakeOrder = async (order, user) => {
    const { id, makerItem, takerItem } = order;

    const balancesBefore = await getBalances();
    await dubiex.makeOrder(
      id,
      makerItem.value,
      takerItem.value,
      makerItem.contractAddress,
      takerItem.contractAddress,
      makerItem.currencyType,
      takerItem.currencyType,
      {
        value: fundOrderWithWei({
          amount: makerItem.value,
          currencyType: makerItem.currencyType,
        }),
        from: user,
      },
    );
    const balancesAfter = await getBalances();

    await assertOrder(order);

    // dubiex is empty
    const dubiexBeforeBalances = balancesBefore[dubiex.address];
    const dubiexIsEmpty = Object.values(dubiexBeforeBalances).every(value => {
      return value.isZero();
    });
    assert.isTrue(dubiexIsEmpty, "dubiex is not empty");

    const dubiexBefore = balancesBefore[dubiex.address][makerItem.contractAddress];
    const dubiexAfter = balancesAfter[dubiex.address][makerItem.contractAddress];
    if (
      makerItem.currencyType === currencyTypes.ETHEREUM ||
      makerItem.currencyType === currencyTypes.ERC20
    ) {
      assert.isTrue(
        dubiexBefore.plus(makerItem.value).equals(dubiexAfter),
        "dubiex ETHEREUM|ERC20 value wrong",
      );
    } else {
      assert.isTrue(dubiexBefore.plus(1).equals(dubiexAfter), "dubiex ERC721 value wrong");
    }

    // user sent
    const userMakerBefore = balancesBefore[user][makerItem.contractAddress];
    const userMakerAfter = balancesAfter[user][makerItem.contractAddress];

    if (makerItem.currencyType === currencyTypes.ETHEREUM) {
      assert.isTrue(userMakerBefore.gt(userMakerAfter), "user ETHEREUM value wrong");
    } else if (makerItem.currencyType === currencyTypes.ERC20) {
      assert.isTrue(
        userMakerBefore.minus(makerItem.value).equals(userMakerAfter),
        "user ERC20 value wrong",
      );
    } else {
      assert.isTrue(userMakerBefore.minus(1).equals(userMakerAfter), "user ERC721 value wrong");
    }
  };

  const assertTakeOrder = async (order, newTakerValue, user) => {
    const { id, makerItem, takerItem } = order;

    let newMakerValue = makerItem.value;

    const calculatedValues = calculateValues(order, makerItem.value, newTakerValue);
    /* eslint-disable-next-line prefer-destructuring, no-param-reassign */
    newMakerValue = calculatedValues.newMakerValue;
    /* eslint-disable-next-line prefer-destructuring, no-param-reassign */
    newTakerValue = calculatedValues.newTakerValue;

    const invalidValues = newMakerValue === 0 || newTakerValue === 0;

    const balancesBefore = await getBalances();
    await dubiex.takeOrder(id, newTakerValue, {
      value: fundOrderWithWei({
        amount: newTakerValue,
        currencyType: takerItem.currencyType,
      }),
      from: user,
    });
    const balancesAfter = await getBalances();

    const newOrder = cloneOrder(order);
    newOrder.makerItem.value = new BigNumber(newOrder.makerItem.value)
      .minus(newMakerValue)
      .toString();
    newOrder.takerItem.value = new BigNumber(newOrder.takerItem.value)
      .minus(newTakerValue)
      .toString();
    await assertOrder(newOrder);

    // dubiex maker currency
    const dubiexMakerBefore = balancesBefore[dubiex.address][makerItem.contractAddress];
    const dubiexMakerAfter = balancesAfter[dubiex.address][makerItem.contractAddress];

    if (invalidValues) {
      dubiexMakerBefore.equals(dubiexMakerAfter);
    } else if (makerItem.currencyType === currencyTypes.ETHEREUM) {
      assert.isTrue(dubiexMakerBefore.gt(dubiexMakerAfter), "dubiex maker ETHEREUM value wrong");
    } else if (makerItem.currencyType === currencyTypes.ERC20) {
      assert.isTrue(
        dubiexMakerBefore.minus(newMakerValue).equals(dubiexMakerAfter),
        "dubiex maker ERC20 value wrong",
      );
    } else {
      assert.isTrue(
        dubiexMakerBefore.minus(1).equals(dubiexMakerAfter),
        "dubiex maker ERC721 value wrong",
      );
    }

    // dubiex taker currency
    const dubiexTakerBefore = balancesBefore[dubiex.address][takerItem.contractAddress];
    const dubiexTakerAfter = balancesAfter[dubiex.address][takerItem.contractAddress];

    if (invalidValues) {
      dubiexTakerBefore.equals(dubiexTakerAfter);
    } else if (takerItem.currencyType === currencyTypes.ETHEREUM) {
      assert.isTrue(true);
    } else if (takerItem.currencyType === currencyTypes.ERC20) {
      assert.isTrue(dubiexTakerBefore.isZero(), "dubiex taker ERC20 value wrong");
      assert.isTrue(dubiexTakerAfter.isZero(), "dubiex taker ERC20 value wrong");
    } else {
      assert.isTrue(dubiexTakerBefore.isZero(), "dubiex taker ERC721 value wrong");
      assert.isTrue(dubiexTakerAfter.isZero(), "dubiex taker ERC721 value wrong");
    }

    // user maker received
    const userMakerReceivedBefore = balancesBefore[makerItem.owner][takerItem.contractAddress];
    const userMakerReceivedAfter = balancesAfter[makerItem.owner][takerItem.contractAddress];

    if (invalidValues) {
      userMakerReceivedBefore.equals(userMakerReceivedAfter);
    } else if (takerItem.currencyType === currencyTypes.ETHEREUM) {
      assert.isTrue(
        userMakerReceivedBefore.lt(userMakerReceivedAfter),
        "userMakerReceived ETHEREUM value wrong",
      );
    } else if (takerItem.currencyType === currencyTypes.ERC20) {
      assert.isTrue(
        userMakerReceivedBefore.plus(newTakerValue).equals(userMakerReceivedAfter),
        "userMakerReceived ERC20 value wrong",
      );
    } else {
      assert.isTrue(
        userMakerReceivedBefore.plus(1).equals(userMakerReceivedAfter),
        "userMakerReceived ERC721 value wrong",
      );
    }

    // user taker received
    const userTakerReceivedBefore = balancesBefore[takerItem.owner][makerItem.contractAddress];
    const userTakerReceivedAfter = balancesAfter[takerItem.owner][makerItem.contractAddress];

    if (invalidValues) {
      userTakerReceivedBefore.equals(userTakerReceivedAfter);
    } else if (makerItem.currencyType === currencyTypes.ETHEREUM) {
      if (takerItem.currencyType === currencyTypes.ETHEREUM) {
        assert.isTrue(true);
      } else {
        assert.isTrue(
          userTakerReceivedBefore.lt(userTakerReceivedAfter),
          "userTakerReceived ETHEREUM value wrong",
        );
      }
    } else if (makerItem.currencyType === currencyTypes.ERC20) {
      assert.isTrue(
        userTakerReceivedBefore.plus(newMakerValue).equals(userTakerReceivedAfter),
        "userTakerReceived ERC20 value wrong",
      );
    } else {
      assert.isTrue(
        userTakerReceivedBefore.plus(1).equals(userTakerReceivedAfter),
        "userTakerReceived ERC721 value wrong",
      );
    }

    // user taker sent
    const userTakerSentBefore = balancesBefore[takerItem.owner][takerItem.contractAddress];
    const userTakerSentAfter = balancesAfter[takerItem.owner][takerItem.contractAddress];

    if (invalidValues) {
      userTakerSentBefore.equals(userTakerSentAfter);
    } else if (takerItem.currencyType === currencyTypes.ETHEREUM) {
      if (makerItem.currencyType === currencyTypes.ETHEREUM) {
        assert.isTrue(true);
      } else {
        assert.isTrue(
          userTakerSentBefore.gt(userTakerSentAfter),
          "userTakerSent ETHEREUM value wrong",
        );
      }
    } else if (takerItem.currencyType === currencyTypes.ERC20) {
      assert.isTrue(
        userTakerSentBefore.minus(newTakerValue).equals(userTakerSentAfter),
        "userTakerSent ERC20 value wrong",
      );
    } else {
      assert.isTrue(
        userTakerSentBefore.minus(1).equals(userTakerSentAfter),
        "userTakerSent ERC721 value wrong",
      );
    }
  };

  const assertCancelOrder = async order => {
    const { id, makerItem } = order;
    const user = makerItem.owner;

    const balancesBefore = await getBalances();
    await dubiex.cancelOrder(id, { from: user });
    const balancesAfter = await getBalances();

    const newOrder = cloneOrder(order);
    newOrder.makerItem.value = 0;
    newOrder.takerItem.value = 0;
    await assertOrder(newOrder);

    // dubiex
    const dubiexAfter = balancesAfter[dubiex.address][makerItem.contractAddress];
    assert.isTrue(dubiexAfter.isZero(), "dubiex is not empty");

    // user sent
    const userMakerBefore = balancesBefore[user][makerItem.contractAddress];
    const userMakerAfter = balancesAfter[user][makerItem.contractAddress];

    if (makerItem.currencyType === currencyTypes.ETHEREUM) {
      assert.isTrue(userMakerBefore.lt(userMakerAfter), "user ETHEREUM value wrong");
    } else if (makerItem.currencyType === currencyTypes.ERC20) {
      assert.isTrue(
        userMakerBefore.plus(makerItem.value).equals(userMakerAfter),
        "user ERC20 value wrong",
      );
    } else {
      assert.isTrue(userMakerBefore.plus(1).equals(userMakerAfter), "user ERC721 value wrong");
    }
  };

  beforeEach(async () => {
    dubiex = await DUBIex.new({ gas: 6000000 });

    // create tokens
    erc20UserA = await ERC20Token.new("erc20UserA", "", 1e18, 1e27, { from: userA });
    erc20UserB = await ERC20Token.new("erc20UserB", "", 1e18, 1e27, { from: userB });
    erc721UserA = await ERC721Token.new("erc721UserA", "", { from: userA });
    erc721UserB = await ERC721Token.new("erc721UserB", "", { from: userB });

    orders = generateOrders({
      userA,
      userB,
      erc20UserA,
      erc20UserB,
      erc721UserA,
      erc721UserB,
    });
  });

  describe("take all", async () => {
    it("eth/eth", async () => {
      const order = orders[0];

      // make order
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("eth/erc20", async () => {
      const order = orders[1];

      // make order
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("eth/erc721", async () => {
      const order = orders[2];

      // make order
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc20/eth", async () => {
      const order = orders[3];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc20/erc20", async () => {
      const order = orders[4];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc20/erc721", async () => {
      const order = orders[5];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc721/eth", async () => {
      const order = orders[6];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc721/erc20", async () => {
      const order = orders[7];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc721/erc721", async () => {
      const order = orders[8];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = order.takerItem.value;
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });
  });

  describe("take all and exceed, should refund ether", async () => {
    it("eth/eth", async () => {
      const order = orders[0];

      // make order
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).times(2).toString();
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc20/eth", async () => {
      const order = orders[3];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).times(2).toString();
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc721/eth", async () => {
      const order = orders[6];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).times(2).toString();
      await assertTakeOrder(order, newTakerValue, userB);
    });
  });

  describe("take half", async () => {
    it("eth/eth", async () => {
      const order = orders[0];

      // make order
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("eth/erc20", async () => {
      const order = orders[1];

      // make order
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("eth/erc721", async () => {
      const order = orders[2];

      // make order
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc20/eth", async () => {
      const order = orders[3];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc20/erc20", async () => {
      const order = orders[4];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc20/erc721", async () => {
      const order = orders[5];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc721/eth", async () => {
      const order = orders[6];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc721/erc20", async () => {
      const order = orders[7];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });

    it("erc721/erc721", async () => {
      const order = orders[8];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      // take order
      const newTakerValue = new BigNumber(order.takerItem.value).div(2).toString();
      await approveItem(order.takerItem, newTakerValue, userB);
      await assertTakeOrder(order, newTakerValue, userB);
    });
  });

  describe("cancel all", async () => {
    it("eth/eth", async () => {
      const order = orders[0];

      // make order
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });

    it("eth/erc20", async () => {
      const order = orders[1];

      // make order
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });

    it("eth/erc721", async () => {
      const order = orders[2];

      // make order
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });

    it("erc20/eth", async () => {
      const order = orders[3];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });

    it("erc20/erc20", async () => {
      const order = orders[4];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });

    it("erc20/erc721", async () => {
      const order = orders[5];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });

    it("erc721/eth", async () => {
      const order = orders[6];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });

    it("erc721/erc20", async () => {
      const order = orders[7];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });

    it("erc721/erc721", async () => {
      const order = orders[8];

      // make order
      await approveItem(order.makerItem, order.makerItem.value, userA);
      await assertMakeOrder(order, userA);

      await assertCancelOrder(order);
    });
  });
});
