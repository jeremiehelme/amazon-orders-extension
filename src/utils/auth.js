// OAuth2 authentication for Google Drive access

/**
 * Authenticates the user with Google Drive using OAuth2
 * @returns {Promise<boolean>} True if authentication was successful
 */
export async function authenticateWithGoogle() {
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('Authentication error:', chrome.runtime.lastError);
          resolve(false);
          return;
        }

        if (!token) {
          resolve(false);
        }
        // Store the token in local storage
        chrome.storage.local.set({ authToken: token }, () => {
          resolve(true);
        });

      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Checks if the user is already authenticated with Google
 * @returns {Promise<boolean>} True if user is authenticated
 */
export async function checkAuthStatus() {
  const authToken = await getAuthToken();
  if (!authToken) {
    console.log('no auth Token:', authToken);
    return false;
  }
  return new Promise((resolve) => {
    // Validate the token by making a test API call
    const init = {
      method: 'GET',
      async: true,
      headers: {
        Authorization: 'Bearer ' + authToken,
        'Content-Type': 'application/json'
      },
      'contentType': 'json'
    };

    fetch('https://www.googleapis.com/drive/v3/about?fields=user', init)
      .then(response => {
        if (response.ok) {
          resolve(true);
        } else {
          // Token is invalid, clear it
          if (response.status === 401) {
            console.log('Token expired or invalid');
            removeAuthToken(authToken);
          }
          resolve(false);
        }
      })
      .catch(error => {
        console.error('Error validating token:', error);
        removeAuthToken(authToken);
        resolve(false);
      });
  });

}

/**
 * Signs the user out of Google
 * @returns {Promise<void>}
 */
export async function signOut() {
  const authToken = await getAuthToken();
  if (!authToken) {
    return;
  }
  return new Promise((resolve, reject) => {
    // Revoke the token
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://accounts.google.com/o/oauth2/revoke?token=' + authToken);
    xhr.send();

    // Remove the token from storage
    removeAuthToken(authToken);
    resolve();
  });
}

/**
 * Gets the current auth token
 * @returns {Promise<string|null>} The auth token or null if not authenticated
 */
export async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get('authToken', (data) => {
      resolve(data.authToken || null);
    });
  });
}

export async function removeAuthToken(authToken) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error removing cached auth token:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
      }
    }
    );
    chrome.storage.local.remove('authToken', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}
