const SolidityEvent = require("web3/lib/web3/event.js");

const logParser = function(logs, abi) {
  // pattern similar to lib/web3/contract.js:  addEventsToContract()
  var decoders = abi
    .filter(function(json) {
      return json.type === "event";
    })
    .map(function(json) {
      // note first and third params required only by enocde and execute;
      // so don't call those!
      return new SolidityEvent(null, json, null);
    });

  return logs.map(function(log) {
    const decoder = decoders.find(function(decoder) {
      const topics = log.topics || [""];
      const topic = topics[0];

      return decoder.signature() == topic.replace("0x", "");
    });

    if (decoder) {
      return decoder.decode(log);
    }
    return null;
  });
};

module.exports = logParser;
