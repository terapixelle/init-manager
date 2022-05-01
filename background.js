let color = '#f0f0f0';

console.log('%cInit Manager has rolled for initiative...Natural 20!', 'color:red')

// Where we will expose all the data we retrieve from storage.sync.
const storageCache = {};
// Asynchronously retrieve data from storage.sync, then cache it.
const initStorageCache = getAllStorageSyncData().then(items => {
  // Copy the data retrieved from storage into storageCache.
  Object.assign(storageCache, items);
});

// Reads all data out of storage.sync and exposes it via a promise.
//
// Note: Once the Storage API gains promise support, this function
// can be greatly simplified.
function getAllStorageSyncData() {
  // Immediately return a promise and start asynchronous work
  return new Promise((resolve, reject) => {
    // Asynchronously fetch all data from storage.sync.
    chrome.storage.sync.get(null, (items) => {
      // Pass any observed errors down the promise chain.
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      // Pass the data retrieved from storage down the promise chain.
      resolve(items);
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ color });
  try {
    initStorageCache;
    console.log('current options:', storageCache)
  } catch (e) {
    // Handle error that occurred during storage initialization.
    console.log('error retrieving cache')
  }

  console.log('Default background color set to %cthis', `color: ${color}`, color);
});