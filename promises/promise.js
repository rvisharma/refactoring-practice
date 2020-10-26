const Pledge = require("./pledge");

console.clear();

const pledge = new Pledge((resolve, reject) => {
  console.log("==========");

  // resolve(42);
  // or

  // reject(42);
});

pledge
  .then(
    (value) => console.log(value),
    (value) => console.error(value)
  )
  .then((value) => console.log(value))
  .catch((reason) => console.error(reason))
  .finally(() => console.log("done"));
//
// // create resolved pledges
// const fulfilled = Pledge.resolve(42);
// const rejected = Pledge.reject(new Error("Uh oh!"));

setTimeout(() => {
  pledge.then(() => {
    console.log(123);
  });
}, 6000);
