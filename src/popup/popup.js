import { authenticateWithGoogle, checkAuthStatus, signOut } from '../utils/auth.js';
import { syncInvoices, getMostRecentInvoices } from '../utils/sync.js';
import { saveConfig, loadConfig } from '../utils/storage.js';
import { listDriveFolders, createFolder, getFolderInfo } from '../utils/drive-api.js';

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const setupScreen = document.getElementById('setup-screen');
  const mainScreen = document.getElementById('main-screen');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingMessage = document.getElementById('loading-message');
  const settingsModal = document.getElementById('settings-modal');
  const newFolderModal = document.getElementById('new-folder-modal');

  // Setup Screen Elements
  const amazonDomainSelect = document.getElementById('amazon-domain');
  const autoSyncToggle = document.getElementById('auto-sync');
  const googleAuthButton = document.getElementById('google-auth');
  const folderSelection = document.getElementById('folder-selection');
  const driveFolderSelect = document.getElementById('drive-folder');
  const createFolderButton = document.getElementById('create-folder');
  const saveConfigButton = document.getElementById('save-config');

  // Main Screen Elements
  const currentDomainSpan = document.getElementById('current-domain');
  const driveStatusSpan = document.getElementById('drive-status');
  const currentFolderSpan = document.getElementById('current-folder');
  const lastSyncTimeSpan = document.getElementById('last-sync-time');
  const syncNowButton = document.getElementById('sync-now');
  const invoicesList = document.getElementById('invoices-list');
  const mainAutoSyncToggle = document.getElementById('main-auto-sync');
  const openSettingsButton = document.getElementById('open-settings');

  // Settings Modal Elements
  const settingsDomainSelect = document.getElementById('settings-domain');
  const settingsFolderSelect = document.getElementById('settings-drive-folder');
  const settingsCreateFolderButton = document.getElementById('settings-create-folder');

  const folderSelectionSettings = document.getElementById('settings-folder-selection');
  const googleAuthSettingsButton = document.getElementById('settings-google-auth');
  const logoutDriveButton = document.getElementById('logout-drive');
  const saveSettingsButton = document.getElementById('save-settings');
  const closeModalButton = document.getElementById('close-modal');

  // New Folder Modal Elements
  const folderNameInput = document.getElementById('folder-name');
  const createFolderSubmitButton = document.getElementById('create-folder-submit');
  const closeFolderModalButton = document.getElementById('close-folder-modal');

  let isAuthenticated = false;
  let config = await loadConfig();
  let currentModal = null;

  // Initialize UI based on config
  initializeUI();

  // Event Listeners for Setup Screen
  googleAuthButton.addEventListener('click', handleGoogleAuth);
  createFolderButton.addEventListener('click', () => showNewFolderModal('setup'));
  driveFolderSelect.addEventListener('change', handleFolderSelect);
  saveConfigButton.addEventListener('click', handleSaveConfig);

  // Event Listeners for Main Screen
  syncNowButton.addEventListener('click', handleSyncNow);
  openSettingsButton.addEventListener('click', async () => {
    initializeUI();
    await loadDriveFolders(settingsFolderSelect);
    settingsModal.classList.remove('hidden');
    settingsDomainSelect.value = config.amazonDomain;
    settingsFolderSelect.value = config.driveFolder.id;
    currentModal = settingsModal;
  });
  mainAutoSyncToggle.addEventListener('change', (e) => {
    config.autoSync = e.target.checked;
    saveConfig(config);
    updateBackgroundSyncStatus();
  });

  // Event Listeners for Settings Modal
  closeModalButton.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    currentModal = null;
  });
  settingsCreateFolderButton.addEventListener('click', () => showNewFolderModal('settings'));
  googleAuthSettingsButton.addEventListener('click', handleGoogleAuth);
  logoutDriveButton.addEventListener('click', handleSignOut);
  saveSettingsButton.addEventListener('click', handleSaveSettings);

  // Event Listeners for New Folder Modal
  closeFolderModalButton.addEventListener('click', () => {
    newFolderModal.classList.add('hidden');
    currentModal = settingsModal;
  });
  createFolderSubmitButton.addEventListener('click', handleCreateFolder);

  // Initialize UI based on configuration
  async function initializeUI() {
    showLoading('Chargement de la configuration...');

    isAuthenticated = await checkAuthStatus();

    if (!config || !config.isConfigured) {
      // First time setup
      setupScreen.classList.remove('hidden');
      mainScreen.classList.add('hidden');

      if (isAuthenticated) {
        googleAuthButton.classList.add('hidden');
        folderSelection.classList.remove('hidden');
        await loadDriveFolders(driveFolderSelect);
      }
      hideLoading();
      return;
    }

    // Normal state - already configured
    setupScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');

    // Update UI with current config
    currentDomainSpan.textContent = config.amazonDomain;
    mainAutoSyncToggle.checked = config.autoSync;

    if (isAuthenticated) {
      driveStatusSpan.textContent = 'Connecté';
      driveStatusSpan.classList.add('connected');
      driveStatusSpan.classList.remove('disconnected');

      googleAuthSettingsButton.classList.add('hidden');
      folderSelectionSettings.classList.remove('hidden');
      logoutDriveButton.classList.remove('hidden');

      // Update folder name
      if (config.driveFolder.id) {
        try {
          const folderInfo = await getFolderInfo(config.driveFolder.id);
          currentFolderSpan.textContent = folderInfo.name;
        } catch (error) {
          console.error('Error getting folder info:', error);
          currentFolderSpan.textContent = 'Erreur';
        }
      }
    } else {
      driveStatusSpan.textContent = 'Déconnecté';
      driveStatusSpan.classList.remove('connected');
      driveStatusSpan.classList.add('disconnected');
      
      googleAuthSettingsButton.classList.remove('hidden');
      folderSelectionSettings.classList.add('hidden');
      logoutDriveButton.classList.add('hidden');
    }

    // Update last sync time
    updateLastSyncTime();

    // Load recent invoices
    await loadRecentInvoices();
    hideLoading();

  }

  // Load Drive folders into a select element
  async function loadDriveFolders(selectElement) {
    isAuthenticated = await checkAuthStatus();

    if (!isAuthenticated) {
      return;
    }

    try {
      const folders = await listDriveFolders();
      // Clear existing options
      selectElement.innerHTML = '<option value="">Sélectionner un dossier...</option>';
      // Add folder options
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        selectElement.appendChild(option);
      });

      // Select current folder if set
      if (config.driveFolder.id) {
        selectElement.value = config.driveFolder.id;
      }
    } catch (error) {
      console.error('Error loading folders:', error);
      alert('Erreur lors du chargement des dossiers');
    }
  }

  // Show new folder modal
  function showNewFolderModal(context) {
    folderNameInput.value = '';
    newFolderModal.classList.remove('hidden');
    folderNameInput.focus();

    // Store the context for when we create the folder
    newFolderModal.dataset.context = context;

    // Hide the current modal
    if (currentModal) {
      currentModal.classList.add('hidden');
    }

    currentModal = newFolderModal;
  }

  // Handle folder selection
  function handleFolderSelect(e) {
    const folderId = e.target.value;
    if (folderId) {
      const folderName = e.target.options[e.target.selectedIndex].text;
      saveConfigButton.disabled = false;
    }
  }

  // Handle Google authentication
  async function handleGoogleAuth() {
    showLoading('Connexion à Google Drive...');
    try {
      const success = await authenticateWithGoogle();
      if (success) {
        isAuthenticated = true;
        googleAuthButton.classList.add('hidden');
        googleAuthSettingsButton.classList.add('hidden');
        logoutDriveButton.classList.remove('hidden');
        folderSelectionSettings.classList.remove('hidden');
        driveStatusSpan.textContent = 'Connecté';
        driveStatusSpan.classList.add('connected');
        driveStatusSpan.classList.remove('disconnected');
        folderSelection.classList.remove('hidden');
        await loadDriveFolders(driveFolderSelect);
      } else {
        alert('Échec de la connexion à Google Drive. Veuillez réessayer.');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      alert('Erreur lors de la connexion: ' + error.message);
    } finally {
      hideLoading();
    }
  }

  // Handle create folder
  async function handleCreateFolder() {
    const folderName = folderNameInput.value.trim();
    if (!folderName) {
      alert('Veuillez entrer un nom de dossier');
      return;
    }

    showLoading('Création du dossier...');

    try {
      const folder = await createFolder(folderName);

      // Update the appropriate select element based on context
      const context = newFolderModal.dataset.context;
      const selectElement = context === 'setup' ? driveFolderSelect : settingsFolderSelect;

      // Add the new folder to the select
      const option = document.createElement('option');
      option.value = folder.id;
      option.textContent = folder.name;
      selectElement.appendChild(option);

      // Select the new folder
      selectElement.value = folder.id;

      // Hide new folder modal and show previous modal
      newFolderModal.classList.add('hidden');
      if (context === 'settings') {
        settingsModal.classList.remove('hidden');
        currentModal = settingsModal;
      } else {
        currentModal = null;
      }

      // Enable save button in setup screen
      if (context === 'setup') {
        saveConfigButton.disabled = false;
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Erreur lors de la création du dossier: ' + error.message);
    } finally {
      hideLoading();
    }
  }

  // Handle save configuration
  async function handleSaveConfig() {
    if (!isAuthenticated) {
      alert('Veuillez vous connecter à Google Drive avant de sauvegarder la configuration.');
      return;
    }

    const folderId = driveFolderSelect.value;
    if (!folderId) {
      alert('Veuillez sélectionner un dossier Google Drive.');
      return;
    }

    showLoading('Enregistrement de la configuration...');

    const folderName = driveFolderSelect.options[driveFolderSelect.selectedIndex].text;

    config = {
      isConfigured: true,
      amazonDomain: amazonDomainSelect.value,
      autoSync: autoSyncToggle.checked,
      lastSync: null,
      driveFolder: {
        id: folderId,
        name: folderName
      }
    };

    await saveConfig(config);
    updateBackgroundSyncStatus();

    // Switch to main screen
    setupScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');

    // Update UI with current config
    currentDomainSpan.textContent = config.amazonDomain;
    currentFolderSpan.textContent = config.driveFolder.name;
    mainAutoSyncToggle.checked = config.autoSync;

    hideLoading();
  }

  // Handle sync now button
  async function handleSyncNow() {
    try {
      isAuthenticated = await checkAuthStatus();
    } catch (error) {
      console.error('Error checking auth status:', error);
    }

    if (!isAuthenticated) {
      alert('Veuillez vous connecter à Google Drive pour synchroniser les factures.');
      return;
    }

    showLoading('Synchronisation des factures...');

    try {
      const result = await syncInvoices(config.amazonDomain, config.driveFolder.id);
      if (result.success) {
        config.lastSync = new Date().toISOString();
        await saveConfig(config);
        updateLastSyncTime();
        await loadRecentInvoices();
        alert(`Synchronisation réussie! ${result.count} factures ont été synchronisées.`);
      } else {
        alert('Échec de la synchronisation: ' + result.error);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('Erreur lors de la synchronisation: ' + error.message);
    } finally {
      hideLoading();
    }
  }

  // Handle sign out
  async function handleSignOut() {
    showLoading('Déconnexion de Google Drive...');

    try {
      await signOut();
      isAuthenticated = false;

      driveStatusSpan.textContent = 'Déconnecté';
      driveStatusSpan.classList.remove('connected');
      driveStatusSpan.classList.add('disconnected');
      logoutDriveButton.classList.add('hidden');
      folderSelectionSettings.classList.add('hidden');
      googleAuthSettingsButton.classList.remove('hidden');
      settingsModal.classList.add('hidden');
      currentModal = null;
    } catch (error) {
      console.error('Sign out error:', error);
      alert('Erreur lors de la déconnexion: ' + error.message);
    } finally {
      hideLoading();
    }
  }

  // Handle save settings
  async function handleSaveSettings() {
    showLoading('Mise à jour des paramètres...');

    const newDomain = settingsDomainSelect.value;
    const newFolderId = settingsFolderSelect.value;

    if (newFolderId && (newDomain !== config.amazonDomain || newFolderId !== config.driveFolder.id)) {
      const folderName = settingsFolderSelect.options[settingsFolderSelect.selectedIndex].text;

      config.amazonDomain = newDomain;
      config.driveFolder = {
        id: newFolderId,
        name: folderName
      };

      await saveConfig(config);

      // Update UI
      currentDomainSpan.textContent = config.amazonDomain;
      currentFolderSpan.textContent = config.driveFolder.name;
    }

    settingsModal.classList.add('hidden');
    currentModal = null;
    hideLoading();
  }

  // Update last sync time display
  function updateLastSyncTime() {
    if (config.lastSync) {
      const lastSyncDate = new Date(config.lastSync);
      lastSyncTimeSpan.textContent = formatDateTime(lastSyncDate);
    } else {
      lastSyncTimeSpan.textContent = 'Jamais';
    }
  }

  // Load recent invoices
  async function loadRecentInvoices() {
    if (!isAuthenticated) {
      return;
    }

    try {
      const invoices = await getMostRecentInvoices(5);

      // Clear current list
      invoicesList.innerHTML = '';

      if (invoices.length === 0) {
        const noInvoicesDiv = document.createElement('div');
        noInvoicesDiv.className = 'no-invoices';
        noInvoicesDiv.textContent = 'Aucune facture synchronisée';
        invoicesList.appendChild(noInvoicesDiv);
      } else {
        // Add invoices to list
        invoices.forEach(invoice => {
          const invoiceItem = document.createElement('div');
          invoiceItem.className = 'invoice-item';

          const details = document.createElement('div');
          details.className = 'invoice-details';

          const date = document.createElement('span');
          date.className = 'invoice-date';
          date.textContent = formatDate(new Date(invoice.date));

          const amount = document.createElement('span');
          amount.className = 'invoice-amount';
          amount.textContent = invoice.amount;

          details.appendChild(date);
          details.appendChild(amount);

          const status = document.createElement('span');
          status.className = `invoice-status status-${invoice.status.toLowerCase()}`;
          status.textContent = getStatusText(invoice.status);

          invoiceItem.appendChild(details);
          invoiceItem.appendChild(status);

          invoicesList.appendChild(invoiceItem);
        });
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    }
  }

  // Format date for display
  function formatDate(date) {
    return date.toLocaleDateString('fr-FR');
  }

  // Format date and time for display
  function formatDateTime(date) {
    return `${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  // Get status text in French
  function getStatusText(status) {
    switch (status.toLowerCase()) {
      case 'success':
        return 'Réussi';
      case 'pending':
        return 'En cours';
      case 'error':
        return 'Erreur';
      default:
        return status;
    }
  }

  // Update background sync status
  function updateBackgroundSyncStatus() {
    // Send message to background script to update alarm
    chrome.runtime.sendMessage({
      action: 'updateSyncSettings',
      autoSync: config.autoSync
    });
  }

  // Show loading overlay with custom message
  function showLoading(message = 'Chargement...') {
    loadingMessage.textContent = message;
    loadingOverlay.classList.remove('hidden');
  }

  // Hide loading overlay
  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  // Handle clicks outside modals to close them
  window.addEventListener('click', (event) => {
    if (event.target === settingsModal) {
      settingsModal.classList.add('hidden');
      currentModal = null;
    } else if (event.target === newFolderModal) {
      newFolderModal.classList.add('hidden');
      if (currentModal === newFolderModal) {
        settingsModal.classList.remove('hidden');
        currentModal = settingsModal;
      } else {
        currentModal = null;
      }
    }
  });
});
