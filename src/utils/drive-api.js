import { getAuthToken } from './auth.js';

// Constants
const API_BASE_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE_URL = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const PDF_MIME_TYPE = 'application/pdf';

/**
 * Creates or gets the invoice folder in Google Drive
 * @param {string} folderId The folder ID to use
 * @returns {Promise<string>} The folder ID
 */
export async function getOrCreateInvoiceFolder(folderId) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Utilisateur non authentifié');
  }

  try {
    // Try to get the folder first
    const folderInfo = await getFolderInfo(folderId);
    return folderInfo.id;
  } catch (error) {
    // If folder doesn't exist, create a new one
    const folder = await createFolder('Amazon Factures');
    return folder.id;
  }
}

/**
 * Lists available folders in Google Drive
 * @returns {Promise<Array>} List of folders
 */
export async function listDriveFolders() {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Utilisateur non authentifié');
  }
  
  const query = `mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
  const url = `${API_BASE_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&orderBy=name`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur lors de la liste des dossiers: ${response.status}`);
  }
  
  const data = await response.json();
  return data.files || [];
}

/**
 * Creates a new folder in Google Drive
 * @param {string} name Folder name
 * @returns {Promise<Object>} Created folder info
 */
export async function createFolder(name) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Utilisateur non authentifié');
  }
  
  const createFolderUrl = `${API_BASE_URL}/files`;
  const createResponse = await fetch(createFolderUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: name,
      mimeType: FOLDER_MIME_TYPE
    })
  });
  
  if (!createResponse.ok) {
    throw new Error(`Erreur lors de la création du dossier: ${createResponse.status}`);
  }
  
  const folder = await createResponse.json();
  return folder;
}

/**
 * Gets folder information by ID
 * @param {string} folderId The folder ID
 * @returns {Promise<Object>} Folder information
 */
export async function getFolderInfo(folderId) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Utilisateur non authentifié');
  }
  
  const url = `${API_BASE_URL}/files/${folderId}?fields=id,name,webViewLink`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur lors de la récupération du dossier: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Uploads a PDF file to Google Drive
 * @param {string} fileName The name of the file
 * @param {Blob} pdfBlob The PDF blob to upload
 * @param {string} folderId The folder ID to upload to
 * @returns {Promise<Object>} The uploaded file metadata
 */
export async function uploadPdfToFolder(fileName, pdfBlob, folderId) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Utilisateur non authentifié');
  }
  
  // Check if file already exists in the folder
  const fileSearchUrl = `${API_BASE_URL}/files?q=name='${fileName}' and '${folderId}' in parents and trashed=false&spaces=drive&fields=files(id,name,webViewLink)`;
  
  const searchResponse = await fetch(fileSearchUrl, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!searchResponse.ok) {
    throw new Error(`Erreur lors de la recherche du fichier: ${searchResponse.status}`);
  }
  
  const searchData = await searchResponse.json();
  
  // Return existing file if found
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0];
  }
  
  // Upload new file
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: PDF_MIME_TYPE
  };
  
  // Create a multi-part request
  const boundary = 'amazon_factures_boundary';
  const delimiter = `--${boundary}`;
  const closeDelimiter = `--${boundary}--`;
  
  // Prepare the multipart body
  let body = '';
  
  // Metadata part
  body += delimiter + '\r\n';
  body += 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
  body += JSON.stringify(metadata) + '\r\n';
  
  // File part
  body += delimiter + '\r\n';
  body += 'Content-Type: application/pdf\r\n\r\n';
  
  // Convert body to a Blob
  const metadataBlob = new Blob([body], { type: 'text/plain' });
  
  // Add the PDF data
  const endBlob = new Blob([`\r\n${closeDelimiter}`], { type: 'text/plain' });
  
  // Combine all blobs
  const multipartBody = new Blob([metadataBlob, pdfBlob, endBlob], { type: 'multipart/related; boundary=' + boundary });
  
  // Upload the file
  const uploadUrl = `${UPLOAD_BASE_URL}/files?uploadType=multipart`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });
  
  if (!uploadResponse.ok) {
    throw new Error(`Erreur lors de l'upload du fichier: ${uploadResponse.status}`);
  }
  
  const uploadData = await uploadResponse.json();
  return uploadData;
}

/**
 * Lists all files in the specified folder
 * @param {string} folderId The folder ID
 * @returns {Promise<Array>} The list of files
 */
export async function listInvoiceFiles(folderId) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Utilisateur non authentifié');
  }
  
  // List all files in the folder
  const listUrl = `${API_BASE_URL}/files?q='${folderId}' in parents and trashed=false&orderBy=createdTime desc&fields=files(id,name,createdTime,webViewLink)`;
  
  const response = await fetch(listUrl, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur lors de la liste des fichiers: ${response.status}`);
  }
  
  const data = await response.json();
  return data.files || [];
}

/**
 * Fetches a PDF file from a URL
 * @param {string} url The URL to fetch
 * @returns {Promise<Blob>} The PDF blob
 */
export async function fetchPdfFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erreur lors du téléchargement du PDF: ${response.status}`);
  }
  
  return await response.blob();
}
