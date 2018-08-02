/* global artifacts */

const BigNumber = require("bignumber.js");

const currencyTypes = {
  ETHEREUM: 0,
  ERC20: 1,
  ERC721: 2,
};

const fungablePrice = 1e18;

const ethereumAddress = "0x0000000000000000000000000000000000000000";

const generateId = () => `${Math.floor(Math.random() * 1e18)}`;

const pickAddress = ({ erc20, erc721, currencyType }) => {
  if (currencyType === currencyTypes.ETHEREUM) return ethereumAddress;
  else if (currencyType === currencyTypes.ERC20) return erc20.address;
  else if (currencyType === currencyTypes.ERC721) return erc721.address;

  throw Error("currencyType does not exist");
};

const pickMakerValue = ({ makerCurrencyType }) => {
  if (makerCurrencyType === currencyTypes.ETHEREUM) return fungablePrice;
  else if (makerCurrencyType === currencyTypes.ERC20) return fungablePrice;
  else if (makerCurrencyType === currencyTypes.ERC721) return generateId();

  throw Error("currencyType does not exist");
};

const pickTakerValue = ({ takerCurrencyType }) => {
  if (takerCurrencyType === currencyTypes.ETHEREUM) return fungablePrice * 2;
  else if (takerCurrencyType === currencyTypes.ERC20) return fungablePrice * 2;
  else if (takerCurrencyType === currencyTypes.ERC721) return generateId();

  throw Error("currencyType does not exist");
};

const generateOrders = ({ userA, userB, erc20UserA, erc20UserB, erc721UserA, erc721UserB }) => {
  const types = Object.values(currencyTypes);

  return types.reduce((all, makerCurrencyType) => {
    types.forEach(takerCurrencyType => {
      const id = generateId();
      const makerValue = pickMakerValue({ makerCurrencyType });
      const takerValue = pickTakerValue({ takerCurrencyType });

      all.push({
        id,
        makerItem: {
          value: makerValue,
          contractAddress: pickAddress({
            erc20: erc20UserA,
            erc721: erc721UserA,
            currencyType: makerCurrencyType,
          }),
          owner: userA,
          currencyType: makerCurrencyType,
        },
        takerItem: {
          value: takerValue,
          contractAddress: pickAddress({
            erc20: erc20UserB,
            erc721: erc721UserB,
            currencyType: takerCurrencyType,
          }),
          owner: userB,
          currencyType: takerCurrencyType,
        },
      });
    });

    return all;
  }, []);
};

const fundOrderWithWei = ({ amount, currencyType }) => {
  if (currencyType === currencyTypes.ETHEREUM) {
    return amount;
  } else if (currencyType === currencyTypes.ERC20) {
    return 0;
  } else if (currencyType === currencyTypes.ERC721) {
    return 0;
  }
};

const cloneOrder = order => {
  return {
    id: order.id,
    makerItem: Object.assign({}, order.makerItem),
    takerItem: Object.assign({}, order.takerItem),
  };
};

const calculateValues = (order, makerValue, takerValue) => {
  let newMakerValue = makerValue;
  let newTakerValue = takerValue;

  if (order.makerItem.currencyType === currencyTypes.ERC721) {
    // if buying ERC721, takerValue must be what maker requested for a price
    if (takerValue !== order.takerItem.value) {
      newTakerValue = 0;
      newMakerValue = 0;
    }
  } else if (order.takerItem.currencyType === currencyTypes.ERC721) {
    // if selling ERC721, takerValue must be what maker requested for a price
    if (takerValue !== order.takerItem.value) {
      newTakerValue = 0;
      newMakerValue = 0;
    }
  } else {
    // if takerValue should not be larger than makers request
    if (takerValue > order.takerItem.value) {
      newTakerValue = order.takerItem.value;
    }

    // calculate makerValue to withdraw
    newMakerValue = new BigNumber(newMakerValue)
      .times(1e18)
      .div(order.takerItem.value)
      .times(newTakerValue)
      .div(1e18)
      .toString();
  }

  return {
    newMakerValue,
    newTakerValue,
  };
};

module.exports = {
  ethereumAddress,
  currencyTypes,
  generateOrders,
  fundOrderWithWei,
  cloneOrder,
  calculateValues,
};
