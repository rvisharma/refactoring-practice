const PledgeSymbol = require("./symbols");

class Pledge {
  static get [Symbol.species]() {
    return this;
  }

  constructor(executor) {
    // error checking
    if (typeof executor === "undefined") {
      throw new TypeError("Executor is undefined");
    }

    if (!isCallable(executor)) {
      throw new TypeError("Executor needs to be function");
    }

    // initialization
    this[PledgeSymbol.state] = "pending";
    this[PledgeSymbol.isHandled] = false;
    this[PledgeSymbol.fulfillReactions] = [];
    this[PledgeSymbol.rejectReactions] = [];
    this[PledgeSymbol.result] = undefined;

    const { resolve, reject } = createResolvingFunction(this);

    /*
     * The executor is executed immediately. If it throws an error, then
     * that is a rejection. The error should not be allowed to bubble
     * out of this function.
     */
    try {
      executor(resolve, reject);
    } catch (error) {
      reject(error);
    }
  }

  then(onFulfilled, onRejected) {
    assertIsPledge(this);

    const C = this.constructor[Symbol.species];
    const resultCapability = new PledgeCapability(C);
    return performPledgeThen(this, onFulfilled, onRejected, resultCapability);
  }
}

function performPledgeThen(pledge, onFulfilled, onRejected, resultCapability) {
  assetIsPledge(pledge);

  if (!isCallable(onFulfilled)) {
    onFulfilled = undefined;
  }

  if (!isCallable(onRejected)) {
    onRejected = undefined;
  }

  const fulfillReaction = new PledgeReaction(
    resultCapability,
    "fulfill",
    onFulfilled
  );
  const rejectReaction = new PledgeReaction(
    resultCapability,
    "reject",
    onRejected
  );

  switch (pledge[PledgeSymbol.state]) {
    case "pending":
      pledge[PledgeSymbol.fulfillReactions].push(fulfillReaction);
      pledge[PledgeSymbol.rejectReactions].push(rejectReaction);
      break;
    case "fulfilled":
      const value = pledge[PledgeSymbol.result];
      const fulfillJob = new PledgeReactionJob(fulfillReaction, value);
      hostEnqueuePledgeJob(fulfillJob);
      break;
    case "rejected":
      const reason = pledge[PledgeSymbol.result];
      const rejectJob = new PledgeReactionJob(rejectReaction, reason);
      hostEnqueuePledgeJob(rejectJob);
      break;
    default:
      throw new TypeError(
        `Invalid pledge state: ${pledge[PledgeSymbol.state]}.`
      );
  }

  pledge[PledgeSymbol.isHandled] = true;

  return resultCapability ? resultCapability.pledge : undefined;
}

class PledgeReaction {
  constructor(capability, type, handler) {
    this.capability = capability;
    this.type = type;
    this.handler = handler;
  }
}

function createResolvingFunction(pledge) {
  const alreadyResolved = { value: false };

  const resolve = (resolution) => {
    if (alreadyResolved.value) {
      return;
    }

    alreadyResolved.value = true;

    // can't resolve to same promise
    if (Object.is(resolution, pledge)) {
      const selfResolutionError = new TypeError(
        "cannot resolve to self, abe ooo"
      );

      return rejectPledge(pledge, selfResolutionError);
    }

    // non object fulfill immediately
    if (!isObject(resolution)) {
      return fulfillPledge(pledge, resolution);
    }

    let thenAction;

    try {
      thenAction = resolution.then;
    } catch (thenError) {
      return rejectPledge(pledge, thenError);
    }

    // if then is not a method.
    if (!isCallable(thenAction)) {
      return fulfillPledge(pledge, resolution);
    }

    const job = new PledgeResolveThenableJob(pledge, resolution, thenAction);
    hostEnqueuePledgeJob(job);
  };

  resolve.pledge = pledge; // not used
  resolve.alreadyResolved = alreadyResolved;

  const reject = (reason) => {
    if (alreadyResolved.value) {
      return;
    }

    alreadyResolved.value = true;

    return rejectPledge(pledge, reason);
  };

  reject.pledge = pledge; // not used
  reject.alreadyResolved = alreadyResolved;

  return {
    reject,
    resolve,
  };
}

function rejectPledge(pledge, reason) {
  if (pledge[PledgeSymbol.state] !== "pending") {
    throw new Error("Pledge is already settled.");
  }

  const reactions = pledge[PledgeSymbol.rejectReactions];

  pledge[PledgeSymbol.result] = reason;
  pledge[PledgeSymbol.fulfillReactions] = undefined;
  pledge[PledgeSymbol.rejectReactions] = undefined;
  pledge[PledgeSymbol.state] = "rejected";

  if (!pledge[PledgeSymbol.isHandled]) {
    // todo: perform host promise rejection tracker
  }

  //todo: return trigger promise reactions
}

function fulfillPledge(pledge, resolution) {
  if (pledge[PledgeSymbol.state] !== "pending") {
    throw new Error("Pledge is already settled.");
  }

  const reactions = pledge[PledgeSymbol.fulfillReactions];

  pledge[PledgeSymbol.result] = resolution;
  pledge[PledgeSymbol.fulfillReactions] = undefined;
  pledge[PledgeSymbol.rejectReactions] = undefined;
  pledge[PledgeSymbol.state] = "fulfilled";

  //todo: return trigger promise reactions
}

function hostEnqueuePledgeJob(job) {
  queueMicrotask(job);
}

function isCallable(argument) {
  return typeof argument === "function";
}

class PledgeResolveThenableJob {
  constructor(pledgeToResolve, thenable, then) {
    return () => {
      const { resolve, reject } = createResolvingFunction(pledgeToResolve);

      try {
        then.apply(thenable, [resolve, reject]);
      } catch (thenError) {
        reject.apply(undefined, [thenError]);
      }
    };
  }
}

class PledgeCapability {
  constructor(C) {
    const executor = (resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    };

    executor.capability = this;

    this.pledge = new C(executor);

    if (!isCallable(this.resolve)) {
      throw new TypeError("resolve is not callable");
    }

    if (!isCallable(this.reject)) {
      throw new TypeError("reject is not callable");
    }
  }
}

module.exports = Pledge;
