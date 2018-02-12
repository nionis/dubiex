const DUBIex = artifacts.require("DUBIex");
const Token = artifacts.require("Token");
const pSeq = require("promise-sequential");

contract("DUBIex", function(accounts) {
  const [owner, maker, taker] = accounts;
  const supplier = owner;
  let dubiex;
  let token;
  let tokenB;

  beforeEach(async function() {
    dubiex = await DUBIex.new();
    token = await Token.new("token", "tk", 18, 1e27);
    tokenB = await Token.new("tokenB", "tkb", 18, 1e27);
  });

  const createMakeOrder = extra => {
    const id = Math.floor(Math.random() * 1e9);
    const amount = Math.floor(Math.random() * 1e3);
    let pairARandom = Math.floor(Math.random() * 2);
    let pairBRandom = pairARandom ? 0 : Math.floor(Math.random() * 2);

    if (extra.pairARandom !== "undefined") {
      pairARandom = extra.pairARandom;
    }
    if (extra.pairBRandom !== "undefined") {
      pairBRandom = extra.pairBRandom;
    }

    const pairA = pairARandom
      ? "0x0000000000000000000000000000000000000000"
      : token.address;
    const pairB = pairBRandom
      ? "0x0000000000000000000000000000000000000000"
      : tokenB.address;

    return {
      id,
      amount,
      pairA,
      pairAIsEth: !!pairARandom,
      pairB,
      pairBAIsEth: !!pairBRandom,
      priceA: 1,
      priceB: 1,
      ...extra
    };
  };

  const createMultiArrs = orders => {
    const inObj = orders.reduce(
      (items, order) => {
        items.ids.push(order.id);
        items.amounts.push(order.amount);
        items.pairAs.push(order.pairA);
        items.pairBs.push(order.pairB);
        items.priceAs.push(order.priceA);
        items.priceBs.push(order.priceB);

        return items;
      },
      {
        ids: [],
        amounts: [],
        pairAs: [],
        pairBs: [],
        priceAs: [],
        priceBs: []
      }
    );

    const values = Object.values(inObj);

    return values;
  };

  const calcAmountB = order => {
    return new web3.BigNumber(order.amount)
      .times(order.priceB)
      .div(order.priceA);
  };

  const checkOrder = async (order, success = true) => {
    const [
      id,
      maker,
      amount,
      pairA,
      pairB,
      priceA,
      priceB
    ] = await dubiex.orders(order.id);

    if (success) {
      assert.isTrue(id.equals(order.id));
      assert.equal(maker, order.maker);
      assert.isTrue(amount.equals(order.amount));
      assert.equal(pairA, order.pairA);
      assert.equal(pairB, order.pairB);
      assert.isTrue(priceA.equals(order.priceA));
      assert.isTrue(priceB.equals(order.priceB));
    } else {
      assert.isTrue(id.equals(0));
      assert.equal(maker, "0x0000000000000000000000000000000000000000");
      assert.isTrue(amount.equals(0));
      assert.equal(pairA, "0x0000000000000000000000000000000000000000");
      assert.equal(pairB, "0x0000000000000000000000000000000000000000");
      assert.isTrue(priceA.equals(0));
      assert.isTrue(priceB.equals(0));
    }

    return order;
  };

  const assertFn = async ({ fn, params = [], expect = true }) => {
    const res = await fn.call(...params);
    const receipt = await fn(...params);

    assert.equal(res, expect);

    return res;
  };

  it("makeOrder eth/token", async function() {
    const id = 1;
    const amount = 10;
    const pairA = "0x0000000000000000000000000000000000000000";
    const pairB = token.address;
    const priceA = 1;
    const priceB = 2;

    const ethBalanceBefore = await web3.eth.getBalance(dubiex.address);

    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker,
          value: amount + 100 // refund
        }
      ]
    });

    const ethBalanceAfter = await web3.eth.getBalance(dubiex.address);

    assert.isTrue(ethBalanceBefore.plus(amount).equals(ethBalanceAfter));

    await checkOrder({
      id,
      amount,
      pairA,
      pairB,
      priceA,
      priceB,
      maker
    });
  });

  it("makeOrder token/eth", async function() {
    const id = 1;
    const amount = 10;
    const pairA = token.address;
    const pairB = "0x0000000000000000000000000000000000000000";
    const priceA = 1;
    const priceB = 2;

    await token.transfer(maker, amount);
    await token.approve(dubiex.address, amount, {
      from: maker
    });

    const tokenBalanceBefore = await token.balanceOf(dubiex.address);
    const tokenBalanceBeforeMaker = await token.balanceOf(maker);

    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker,
          value: 100 // refund
        }
      ]
    });

    const tokenBalanceAfter = await token.balanceOf(dubiex.address);
    const tokenBalanceAfterMaker = await token.balanceOf(maker);

    assert.isTrue(tokenBalanceBefore.plus(amount).equals(tokenBalanceAfter));
    assert.isTrue(
      tokenBalanceBeforeMaker.minus(amount).equals(tokenBalanceAfterMaker)
    );

    await checkOrder({
      id,
      amount,
      pairA,
      pairB,
      priceA,
      priceB,
      maker
    });
  });

  it("makeOrder token/eth, not enough tokens", async function() {
    const id = 1;
    const amount = 10;
    const pairA = token.address;
    const pairB = "0x0000000000000000000000000000000000000000";
    const priceA = 1;
    const priceB = 2;

    await token.transfer(maker, amount);
    await token.approve(dubiex.address, amount - 1, {
      from: maker
    });

    const tokenBalanceBefore = await token.balanceOf(dubiex.address);
    const tokenBalanceBeforeMaker = await token.balanceOf(maker);

    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker,
          value: 100 // refund
        }
      ],
      expect: false
    });

    const tokenBalanceAfter = await token.balanceOf(dubiex.address);
    const tokenBalanceAfterMaker = await token.balanceOf(maker);

    assert.isTrue(tokenBalanceBefore.equals(tokenBalanceAfter));
    assert.isTrue(tokenBalanceBeforeMaker.equals(tokenBalanceAfterMaker));

    await checkOrder(
      {
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        maker
      },
      false
    );
  });

  it("makeOrder token/token", async function() {
    const id = 1;
    const amount = 10;
    const pairA = token.address;
    const pairB = tokenB.address;
    const priceA = 1;
    const priceB = 2;

    await token.transfer(maker, amount);
    await token.approve(dubiex.address, amount, {
      from: maker
    });

    const tokenBalanceBefore = await token.balanceOf(dubiex.address);
    const tokenBalanceBeforeMaker = await token.balanceOf(maker);

    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker,
          value: 100 // refund
        }
      ]
    });

    const tokenBalanceAfter = await token.balanceOf(dubiex.address);
    const tokenBalanceAfterMaker = await token.balanceOf(maker);

    assert.isTrue(tokenBalanceBefore.plus(amount).equals(tokenBalanceAfter));
    assert.isTrue(
      tokenBalanceBeforeMaker.minus(amount).equals(tokenBalanceAfterMaker)
    );

    await checkOrder({
      id,
      amount,
      pairA,
      pairB,
      priceA,
      priceB,
      maker
    });
  });

  it("makeOrder token/token, not enough tokens", async function() {
    const id = 1;
    const amount = 10;
    const pairA = token.address;
    const pairB = tokenB.address;
    const priceA = 1;
    const priceB = 2;

    await token.transfer(maker, amount);
    await token.approve(dubiex.address, amount / 2, {
      from: maker
    });

    const tokenBalanceBefore = await token.balanceOf(dubiex.address);
    const tokenBalanceBeforeMaker = await token.balanceOf(maker);

    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker,
          value: 100 // refund
        }
      ],
      expect: false
    });

    const tokenBalanceAfter = await token.balanceOf(dubiex.address);
    const tokenBalanceAfterMaker = await token.balanceOf(maker);

    assert.isTrue(tokenBalanceBefore.equals(tokenBalanceAfter));
    assert.isTrue(tokenBalanceBeforeMaker.equals(tokenBalanceAfterMaker));

    await checkOrder(
      {
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        maker
      },
      false
    );
  });

  it("makeOrders mixed", async function() {
    // create orders data to send
    const orders = Array.from(Array(10)).map(() => {
      return createMakeOrder({ maker });
    });
    const arrs = createMultiArrs(orders);

    // total eth
    const refundAmount = 100;
    const totalEth = orders.reduce((sum, order) => {
      if (order.pairAIsEth) {
        return new web3.BigNumber(sum).plus(order.amount);
      }

      return sum;
    }, refundAmount);

    // total token
    const totalToken = orders.reduce((sum, order) => {
      if (order.pairA === token.address) {
        return new web3.BigNumber(sum).plus(order.amount);
      }

      return sum;
    }, 0);
    await token.transfer(maker, totalToken);
    await token.approve(dubiex.address, totalToken, {
      from: maker
    });

    const dubiexEthBefore = await web3.eth.getBalance(dubiex.address);
    const dubiexTokenBefore = await token.balanceOf(dubiex.address);
    const makerTokenBefore = await token.balanceOf(maker);

    // make orders
    await assertFn({
      fn: dubiex.makeOrders,
      params: [
        ...arrs,
        {
          from: maker,
          value: totalEth
        }
      ]
    });

    const dubiexEthAfter = await web3.eth.getBalance(dubiex.address);
    const dubiexTokenAfter = await token.balanceOf(dubiex.address);
    const makerTokenAfter = await token.balanceOf(maker);

    // console.log({
    //   totalEth,
    //   totalToken,
    //   totalTokenB,
    //   dubiexEthBefore,
    //   dubiexTokenBefore,
    //   makerTokenBefore,
    //   dubiexTokenBBefore,
    //   makerTokenBBefore,
    //   dubiexEthAfter,
    //   dubiexTokenAfter,
    //   makerTokenAfter,
    // });

    assert.isTrue(
      dubiexEthBefore
        .plus(totalEth)
        .minus(refundAmount)
        .equals(dubiexEthAfter)
    );
    assert.isTrue(dubiexTokenBefore.plus(totalToken).equals(dubiexTokenAfter));
    assert.isTrue(makerTokenBefore.minus(totalToken).equals(makerTokenAfter));

    await pSeq(orders.map(order => () => checkOrder(order)));
  });

  it("makeOrders eth/token, some failing", async function() {
    const order1 = createMakeOrder({ maker, pairARandom: 1 });
    const order2 = createMakeOrder({ maker, pairARandom: 1 });
    const arrs = createMultiArrs([order1, order2]);

    // only order1
    const totalAmount = new web3.BigNumber(order1.amount);

    const dubiexEthBefore = await web3.eth.getBalance(dubiex.address);

    // make orders
    await assertFn({
      fn: dubiex.makeOrders,
      params: [
        ...arrs,
        {
          from: maker,
          value: totalAmount
        }
      ],
      expect: false
    });

    const dubiexEthAfter = await web3.eth.getBalance(dubiex.address);

    assert.isTrue(dubiexEthBefore.plus(totalAmount).equals(dubiexEthAfter));

    await checkOrder(order1);
    await checkOrder(order2, false);
  });

  it("makeOrders token/eth, some failing", async function() {
    const order1 = createMakeOrder({ maker, pairARandom: 0 });
    const order2 = createMakeOrder({ maker, pairARandom: 0 });
    const arrs = createMultiArrs([order1, order2]);

    // only order1
    const totalAmount = new web3.BigNumber(order1.amount);
    await token.transfer(maker, totalAmount);
    await token.approve(dubiex.address, totalAmount, {
      from: maker
    });

    const ethBalanceBefore = await web3.eth.getBalance(dubiex.address);
    const tokenBalanceBefore = await token.balanceOf(dubiex.address);
    const tokenBalanceBeforeMaker = await token.balanceOf(maker);

    // make orders
    await assertFn({
      fn: dubiex.makeOrders,
      params: [
        ...arrs,
        {
          from: maker,
          value: 100
        }
      ],
      expect: false
    });

    const ethBalanceAfter = await web3.eth.getBalance(dubiex.address);
    const tokenBalanceAfter = await token.balanceOf(dubiex.address);
    const tokenBalanceAfterMaker = await token.balanceOf(maker);

    // console.log({
    //   totalAmount,
    //   ethBalanceBefore,
    //   tokenBalanceBefore,
    //   tokenBalanceBeforeMaker,
    //   ethBalanceAfter,
    //   tokenBalanceAfter,
    //   tokenBalanceAfterMaker
    // });

    assert.isTrue(ethBalanceBefore.equals(0));
    assert.isTrue(
      tokenBalanceBefore.plus(totalAmount).equals(tokenBalanceAfter)
    );
    assert.isTrue(
      tokenBalanceBeforeMaker.minus(totalAmount).equals(tokenBalanceAfterMaker)
    );

    await checkOrder(order1);
    await checkOrder(order2, false);
  });

  it("takeOrder eth/token", async function() {
    const id = 1;
    const amount = 10;
    const pairA = "0x0000000000000000000000000000000000000000";
    const pairB = token.address;
    const priceA = 1;
    const priceB = 2;
    const amountB = calcAmountB({
      amount,
      priceA,
      priceB
    });

    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker,
          value: amount
        }
      ]
    });

    await token.transfer(taker, amountB);
    await token.approve(dubiex.address, amountB, {
      from: taker
    });

    const ethBalanceBefore = await web3.eth.getBalance(dubiex.address);
    const ethBalanceBeforeTaker = await web3.eth.getBalance(taker);
    const tokenBalanceBeforeMaker = await token.balanceOf(maker);
    const tokenBalanceBeforeTaker = await token.balanceOf(taker);

    // take order
    await assertFn({
      fn: dubiex.takeOrder,
      params: [
        id,
        amount,
        {
          from: taker,
          value: 100 // refund
        }
      ]
    });

    const ethBalanceAfter = await web3.eth.getBalance(dubiex.address);
    const ethBalanceAfterTaker = await web3.eth.getBalance(taker);
    const tokenBalanceAfterMaker = await token.balanceOf(maker);
    const tokenBalanceAfterTaker = await token.balanceOf(taker);

    assert.isTrue(ethBalanceBefore.minus(amount).equals(ethBalanceAfter));
    assert.isTrue(ethBalanceAfter.equals(0));

    assert.isTrue(tokenBalanceBeforeMaker.equals(0));
    assert.isTrue(
      tokenBalanceBeforeMaker.plus(amountB).equals(tokenBalanceAfterMaker)
    );
    assert.isTrue(
      tokenBalanceBeforeTaker.minus(amountB).equals(tokenBalanceAfterTaker)
    );

    await checkOrder({
      id,
      amount: 0,
      pairA,
      pairB,
      priceA,
      priceB,
      maker
    });
  });

  it("takeOrder token/eth", async function() {
    const id = 1;
    const amount = 10;
    const pairA = token.address;
    const pairB = "0x0000000000000000000000000000000000000000";
    const priceA = 1;
    const priceB = 2;
    const amountB = calcAmountB({
      amount,
      priceA,
      priceB
    });

    await token.transfer(maker, amount);
    await token.approve(dubiex.address, amount, {
      from: maker
    });
    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker
        }
      ]
    });

    const tokenBalanceBefore = await token.balanceOf(dubiex.address);

    // take order
    await assertFn({
      fn: dubiex.takeOrder,
      params: [
        id,
        amount,
        {
          from: taker,
          value: amountB + 100 // refund
        }
      ]
    });

    const tokenBalanceAfter = await token.balanceOf(dubiex.address);

    assert.isTrue(tokenBalanceBefore.minus(amount).equals(tokenBalanceAfter));

    await checkOrder({
      id,
      amount: 0,
      pairA,
      pairB,
      priceA,
      priceB,
      maker
    });
  });

  it("takeOrder token/token", async function() {
    const id = 1;
    const amount = 10;
    const pairA = token.address;
    const pairB = tokenB.address;
    const priceA = 1;
    const priceB = 2;
    const amountB = calcAmountB({
      amount,
      priceA,
      priceB
    });

    await token.transfer(maker, amount);
    await token.approve(dubiex.address, amount, {
      from: maker
    });
    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker
        }
      ]
    });

    await tokenB.transfer(taker, amountB);
    await tokenB.approve(dubiex.address, amountB, {
      from: taker
    });

    const tokenBalanceBeforeDubiex = await token.balanceOf(dubiex.address);
    const tokenBBalanceBeforeMaker = await tokenB.balanceOf(maker);
    const tokenBalanceBeforeTaker = await token.balanceOf(taker);

    // take order
    await assertFn({
      fn: dubiex.takeOrder,
      params: [
        id,
        amount,
        {
          from: taker,
          value: 100 // refund
        }
      ]
    });

    const tokenBalanceAfterDubiex = await token.balanceOf(dubiex.address);
    const tokenBBalanceAfterMaker = await tokenB.balanceOf(maker);
    const tokenBalanceAfterTaker = await token.balanceOf(taker);

    assert.isTrue(
      tokenBalanceBeforeDubiex.minus(amount).equals(tokenBalanceAfterDubiex)
    );
    assert.isTrue(
      tokenBBalanceBeforeMaker.plus(amountB).equals(tokenBBalanceAfterMaker)
    );
    assert.isTrue(
      tokenBalanceBeforeTaker.plus(amount).equals(tokenBalanceAfterTaker)
    );

    await checkOrder({
      id,
      amount: 0,
      pairA,
      pairB,
      priceA,
      priceB,
      maker
    });
  });

  it("cancelOrder eth/x", async function() {
    const id = 1;
    const amount = 10;
    const pairA = "0x0000000000000000000000000000000000000000";
    const pairB = token.address;
    const priceA = 1;
    const priceB = 2;

    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker,
          value: amount
        }
      ]
    });

    // cancel order
    await assertFn({
      fn: dubiex.cancelOrder,
      params: [
        id,
        {
          from: maker
        }
      ]
    });

    await checkOrder({
      id,
      amount: 0,
      pairA,
      pairB,
      priceA,
      priceB,
      maker
    });
  });

  it("cancelOrder token/x", async function() {
    const id = 1;
    const amount = 10;
    const pairA = token.address;
    const pairB = "0x0000000000000000000000000000000000000000";
    const priceA = 1;
    const priceB = 2;

    await token.transfer(maker, amount);
    await token.approve(dubiex.address, amount, {
      from: maker
    });

    // make order
    await assertFn({
      fn: dubiex.makeOrder,
      params: [
        id,
        amount,
        pairA,
        pairB,
        priceA,
        priceB,
        {
          from: maker
        }
      ]
    });

    // cancel order
    await assertFn({
      fn: dubiex.cancelOrder,
      params: [
        id,
        {
          from: maker
        }
      ]
    });

    await checkOrder({
      id,
      amount: 0,
      pairA,
      pairB,
      priceA,
      priceB,
      maker
    });
  });
});
