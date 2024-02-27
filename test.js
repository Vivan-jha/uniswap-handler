
const { getRatesArray,getSwapData} = require('./index');


async function runTest(description, testFunc) {
  try {
    console.log(`Running test: ${description}`);
    await testFunc();
    console.log('✅ Test passed');
  } catch (error) {
    console.error(`❌ Test failed:`, error.message);
  }
}

async function testNormalCase() {
  const result = await getRatesArray(
    ["0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "0x2170Ed0880ac9A755fd29B2688956BD959F933F8"],
    ["0x2170Ed0880ac9A755fd29B2688956BD959F933F8", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"]
    ['100', '200']
  );
  console.log(result);
}

async function testDifferentLengths() {
  try {
    await getRatesArray(
        ["0xdac17f958d2ee523a2206206994597c13d831ec7", "0x6b175474e89094c44da98b954eedeac495271d0f"],
        ["0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]
        ['100', '200','300']
    );
  } catch (error) {
    if (error.message.includes('Input arrays must have the same length')) {
      console.log('Caught expected error:', error.message);
    } else {
      throw error; // rethrow unexpected errors
    }
  }
}

async function testNullRateResult() {
  const result = await getRatesArray(
    ["0xdac17f958d2ee523a2206206994597c13d831ec7", "0x6b175474e89094c44da98b954eedeac495271d0f"],
    ["0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]
    ['100', '200',null]
  );
  console.log(result);
}

async function testHandlingErrors() {
  try {
    await getRatesArray(['0xdac17f958d2ee523a2206206994597c13d831ec7'], ['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'], ['100']);
  } catch (error) {
    console.log('Caught expected error:', error.message);
  }
}

// Run the tests
runTest('Normal case where all responses are valid', testNormalCase);
runTest('Different lengths for input arrays', testDifferentLengths);
runTest('Null result from getSwapData for a pair', testNullRateResult);
runTest('Handling errors thrown by getSwapData', testHandlingErrors);

