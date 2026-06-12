const app = {
    servers: [],
    registries: [],
    projects: [],
    environments: [],
    templates: [],
    healthStatus: {},
    currentProjectId: null,
    
    init() {
        this.bindEvents();
        this.fetchServers();
        this.fetchRegistries();
        this.fetchProjects();
        this.fetchEnvironments();
        this.fetchTemplates();
        this.fetchSettings();
        this.fetchHealth();
        
        // Poll health every 30s
        setInterval(() => this.fetchHealth(), 30000);
    },

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-links li').forEach(link => {
            link.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                
                const tab = link.dataset.tab;
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById(tab).classList.add('active');
            });
        });

        // Forms
        document.getElementById('server-form').addEventListener('submit', this.handleServerSubmit.bind(this));
        document.getElementById('registry-form').addEventListener('submit', this.handleRegistrySubmit.bind(this));
        document.getElementById('project-form').addEventListener('submit', this.handleProjectSubmit.bind(this));
        document.getElementById('environment-form').addEventListener('submit', this.handleEnvironmentSubmit.bind(this));
        document.getElementById('template-form').addEventListener('submit', this.handleTemplateSubmit.bind(this));
        document.getElementById('settings-token-form').addEventListener('submit', this.handleTokenSubmit.bind(this));
        document.getElementById('token-modal-form').addEventListener('submit', this.handleTokenSubmit.bind(this));
        document.getElementById('settings-ghcr-form').addEventListener('submit', this.handleGhcrSubmit.bind(this));
        document.getElementById('ghcr-modal-form').addEventListener('submit', this.handleGhcrSubmit.bind(this));
    },

    // --- API Calls ---
    async api(endpoint, method = 'GET', data = null, customHeaders = {}) {
        const options = { method, headers: { 'Content-Type': 'application/json', ...customHeaders } };
        if (data) options.body = JSON.stringify(data);
        
        try {
            const res = await fetch(`/api/${endpoint}`, options);
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (e) {
            this.showToast(`Error: ${e.message}`, true);
            throw e;
        }
    },

    async fetchServers() {
        this.servers = await this.api('servers');
        this.renderServers();
        this.updateServerDropdown();
    },

    async fetchRegistries() {
        this.registries = await this.api('registry');
        this.checkRegistryExpirations();
        this.renderRegistries();
        this.updateRegistryDropdown();
    },

    checkRegistryExpirations() {
        const now = new Date();
        const expiredRegistries = this.registries.filter(r => {
            if (!r.expiresAt) return false;
            return new Date(r.expiresAt) < now;
        });

        const warningBanner = document.getElementById('registry-warning');
        const alertBadge = document.getElementById('registries-alert-badge');

        if (expiredRegistries.length > 0) {
            if (warningBanner) {
                const names = expiredRegistries.map(r => r.name).join(', ');
                document.getElementById('registry-warning-text').innerHTML = `<strong>Registry Token Expired:</strong> The token for registry (<strong>${names}</strong>) has expired. Deployments using these registries may fail.`;
                warningBanner.style.display = 'flex';
            }
            if (alertBadge) {
                alertBadge.innerText = expiredRegistries.length;
                alertBadge.style.display = 'inline-flex';
            }
        } else {
            if (warningBanner) warningBanner.style.display = 'none';
            if (alertBadge) alertBadge.style.display = 'none';
        }
    },

    async fetchProjects() {
        this.projects = await this.api('projects');
        this.renderProjects();
        this.updateDashboard();
    },

    async fetchEnvironments() {
        this.environments = await this.api('environment');
        this.renderEnvironments();
        this.updateEnvDropdowns();
    },

    async fetchTemplates() {
        this.templates = await this.api('template');
        this.renderTemplates();
    },

    async fetchSettings() {
        // Fetch AGENT_SECRET_TOKEN status
        try {
            const data = await this.api('settings/AGENT_SECRET_TOKEN');
            this.hasSecretToken = data.isSet;
            
            if (this.hasSecretToken) {
                document.getElementById('settings-token-unconfigured').style.display = 'none';
                document.getElementById('settings-token-configured').style.display = 'block';
            } else {
                document.getElementById('settings-token-unconfigured').style.display = 'block';
                document.getElementById('settings-token-configured').style.display = 'none';
            }
        } catch(e) {
            this.hasSecretToken = false;
        }
        
        // Fetch GHCR credentials status
        try {
            const [userRes, tokenRes] = await Promise.all([
                this.api('settings/GHCR_USERNAME'),
                this.api('settings/GHCR_TOKEN'),
            ]);
            this.hasGhcr = !!(userRes.value && tokenRes.isSet);
            
            if (this.hasGhcr) {
                document.getElementById('settings-ghcr-unconfigured').style.display = 'none';
                document.getElementById('settings-ghcr-configured').style.display = 'block';
            } else {
                document.getElementById('settings-ghcr-unconfigured').style.display = 'block';
                document.getElementById('settings-ghcr-configured').style.display = 'none';
            }
        } catch(e) {
            this.hasGhcr = false;
        }
        
        // Global warning banner
        const warning = document.getElementById('global-warning');
        warning.style.display = this.hasSecretToken ? 'none' : 'flex';
        
        // Self-update GHCR warning
        const ghcrWarning = document.getElementById('selfupdate-ghcr-warning');
        ghcrWarning.style.display = this.hasGhcr ? 'none' : 'flex';
        
        this.renderProjects();
    },

    async fetchHealth() {
        this.healthStatus = await this.api('health');
        this.updateDashboard();
        this.renderProjects();
    },

    // --- Renderers ---
    renderServers() {
        const tbody = document.querySelector('#servers-table tbody');
        tbody.innerHTML = this.servers.map(s => `
            <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.ipOrHostname}</td>
                <td>${s.username}</td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editServer(${s.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteServer(${s.id})">Delete</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4">No servers configured.</td></tr>';
    },

    renderRegistries() {
        const tbody = document.querySelector('#registries-table tbody');
        const now = new Date();
        tbody.innerHTML = this.registries.map(r => {
            let expiryHtml = '';
            if (r.expiresAt) {
                const d = new Date(r.expiresAt);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (d < now) {
                    expiryHtml = `<span class="status status-expired">⚠️ Expired (${dateStr})</span>`;
                } else {
                    expiryHtml = `<span class="status status-active">✓ Active (Expires: ${dateStr})</span>`;
                }
            } else {
                expiryHtml = `<span class="status status-no-expiry">No Expiration</span>`;
            }

            return `
                <tr>
                    <td><strong>${r.name}</strong></td>
                    <td>${r.url}</td>
                    <td>${r.username}</td>
                    <td>${expiryHtml}</td>
                    <td class="actions-cell">
                        <button class="btn btn-sm btn-secondary" onclick="app.editRegistry(${r.id})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="app.deleteRegistry(${r.id})">Delete</button>
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="5">No registries configured.</td></tr>';
    },

    renderProjects() {
        const tbody = document.querySelector('#projects-table tbody');
        tbody.innerHTML = this.projects.map(p => {
            const status = this.healthStatus[p.id] || 'unknown';
            const statusClass = status.includes('running') || status.includes('Up') ? 'status-running' : (status === 'unknown' ? 'status-unknown' : 'status-down');
            
            return `
            <tr>
                <td>
                    <strong>${p.name}</strong><br>
                    <span class="status ${statusClass}">${status}</span>
                </td>
                <td>${p.server ? p.server.name : 'Unassigned'}</td>
                <td>${p.containerName}</td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editProject(${p.id})">Edit</button>
                    <button class="btn btn-sm btn-primary" onclick="app.triggerDeploy('${p.webhookToken}')" ${!this.hasSecretToken ? 'disabled style="opacity:0.5;cursor:not-allowed;" title="Disabled: Set AGENT_SECRET_TOKEN"' : ''}>Deploy</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteProject(${p.id})">Delete</button>
                </td>
            </tr>
        `}).join('') || '<tr><td colspan="5">No projects configured.</td></tr>';
    },

    renderEnvironments() {
        const tbody = document.querySelector('#environments-table tbody');
        tbody.innerHTML = this.environments.map(e => `
            <tr>
                <td><strong>${e.key}</strong></td>
                <td>${e.value}</td>
                <td>${e.description || ''}</td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editEnvironment(${e.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteEnvironment(${e.id})">Delete</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4">No environments configured.</td></tr>';
    },

    renderTemplates() {
        const tbody = document.querySelector('#templates-table tbody');
        tbody.innerHTML = this.templates.map(t => `
            <tr>
                <td><strong>${t.name}</strong></td>
                <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" onclick="app.editTemplate(${t.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteTemplate(${t.id})">Delete</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="2">No templates configured.</td></tr>';
    },

    updateServerDropdown() {
        const select = document.getElementById('project-server');
        select.innerHTML = '<option value="">Select a server...</option>' + 
            this.servers.map(s => `<option value="${s.id}">${s.name} (${s.ipOrHostname})</option>`).join('');
    },

    updateRegistryDropdown() {
        const select = document.getElementById('project-registry');
        select.innerHTML = '<option value="">None (Public Image)</option>' + 
            this.registries.map(r => `<option value="${r.id}">${r.name} (${r.url})</option>`).join('');
    },

    updateEnvDropdowns() {
        const select = document.getElementById('env-select-dropdown');
        select.innerHTML = '<option value="">Select an environment to add...</option>' + 
            this.environments.map(e => `<option value="${e.id}">${e.key}</option>`).join('');
    },

    updateDashboard() {
        const upCount = Object.values(this.healthStatus).filter(s => s.includes('running') || s.includes('Up')).length;
        document.getElementById('dashboard-stats').innerHTML = `
            <div class="stat-card">
                <h3>Total Servers</h3>
                <div class="value">${this.servers.length}</div>
            </div>
            <div class="stat-card">
                <h3>Total Projects</h3>
                <div class="value">${this.projects.length}</div>
            </div>
            <div class="stat-card">
                <h3>Running Containers</h3>
                <div class="value" style="color: var(--success)">${upCount}</div>
            </div>
        `;
    },

    // --- Modals & Forms ---
    closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    },

    openServerModal() {
        document.getElementById('server-form').reset();
        document.getElementById('server-id').value = '';
        document.getElementById('server-modal-title').innerText = 'Add Server';
        document.getElementById('server-modal').classList.add('active');
    },

    async editServer(id) {
        const server = await this.api(`servers/${id}`);
        document.getElementById('server-id').value = server.id;
        document.getElementById('server-name').value = server.name;
        document.getElementById('server-ip').value = server.ipOrHostname;
        document.getElementById('server-user').value = server.username;
        document.getElementById('server-key').value = server.privateKey || '';
        document.getElementById('server-pass').value = '';
        document.getElementById('server-modal-title').innerText = 'Edit Server';
        document.getElementById('server-modal').classList.add('active');
    },

    async handleServerSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('server-id').value;
        const data = {
            name: document.getElementById('server-name').value,
            ipOrHostname: document.getElementById('server-ip').value,
            username: document.getElementById('server-user').value,
        };
        const key = document.getElementById('server-key').value;
        const pass = document.getElementById('server-pass').value;
        if (key) data.privateKey = key;
        if (pass) data.password = pass;

        if (id) await this.api(`servers/${id}`, 'PUT', data);
        else await this.api('servers', 'POST', data);

        this.showToast(`Server ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchServers();
    },

    async deleteServer(id) {
        if(confirm('Are you sure you want to delete this server?')) {
            await this.api(`servers/${id}`, 'DELETE');
            this.showToast('Server deleted.');
            this.fetchServers();
        }
    },

    // --- Registries CRUD ---
    openRegistryModal() {
        document.getElementById('registry-form').reset();
        document.getElementById('registry-id').value = '';
        document.getElementById('registry-expiry-select').value = 'no-expiry';
        document.getElementById('custom-expiry-container').style.display = 'none';
        document.getElementById('registry-custom-expires-at').value = '';
        document.getElementById('registry-modal-title').innerText = 'Add Registry';
        document.getElementById('registry-modal').classList.add('active');
    },

    handleExpiryChange() {
        const select = document.getElementById('registry-expiry-select');
        const container = document.getElementById('custom-expiry-container');
        if (select.value === 'custom') {
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    },

    async editRegistry(id) {
        const registry = await this.api(`registry/${id}`);
        document.getElementById('registry-id').value = registry.id;
        document.getElementById('registry-name').value = registry.name;
        document.getElementById('registry-url').value = registry.url;
        document.getElementById('registry-user').value = registry.username;
        document.getElementById('registry-pass').value = registry.token;
        if (registry.expiresAt) {
            document.getElementById('registry-expiry-select').value = 'custom';
            document.getElementById('custom-expiry-container').style.display = 'block';
            const d = new Date(registry.expiresAt);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            document.getElementById('registry-custom-expires-at').value = dateStr;
        } else {
            document.getElementById('registry-expiry-select').value = 'no-expiry';
            document.getElementById('custom-expiry-container').style.display = 'none';
            document.getElementById('registry-custom-expires-at').value = '';
        }
        document.getElementById('registry-modal-title').innerText = 'Edit Registry';
        document.getElementById('registry-modal').classList.add('active');
    },

    async handleRegistrySubmit(e) {
        e.preventDefault();
        const id = document.getElementById('registry-id').value;
        const expirySelect = document.getElementById('registry-expiry-select').value;
        
        let expiresAt = null;
        if (expirySelect === 'custom') {
            const customDate = document.getElementById('registry-custom-expires-at').value;
            expiresAt = customDate ? new Date(customDate).toISOString() : null;
        } else if (expirySelect !== 'no-expiry') {
            const days = parseInt(expirySelect, 10);
            const d = new Date();
            d.setDate(d.getDate() + days);
            expiresAt = d.toISOString();
        }

        const data = {
            name: document.getElementById('registry-name').value,
            url: document.getElementById('registry-url').value,
            username: document.getElementById('registry-user').value,
            token: document.getElementById('registry-pass').value,
            expiresAt
        };

        if (id) await this.api(`registry/${id}`, 'PUT', data);
        else await this.api('registry', 'POST', data);

        this.showToast(`Registry ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchRegistries();
    },

    async deleteRegistry(id) {
        if(confirm('Are you sure you want to delete this registry?')) {
            await this.api(`registry/${id}`, 'DELETE');
            this.showToast('Registry deleted.');
            this.fetchRegistries();
        }
    },

    openProjectModal() {
        document.getElementById('project-form').reset();
        document.getElementById('project-id').value = '';
        document.getElementById('env-list').innerHTML = '';
        document.getElementById('btn-rotate-token').style.display = 'none';
        
        // Default Compose YAML
        document.getElementById('project-compose').value = `version: '3.8'
services:
  app:
    image: ghcr.io/username/repo:latest
    container_name: app_name
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - .env`;

        this.addEnvRow();
        document.getElementById('project-modal-title').innerText = 'Add Project';
        document.getElementById('project-modal').classList.add('active');
    },

    async editProject(id) {
        const project = await this.api(`projects/${id}`);
        document.getElementById('project-id').value = project.id;
        document.getElementById('project-name').value = project.name;
        document.getElementById('project-server').value = project.server ? project.server.id : '';
        document.getElementById('project-registry').value = project.registry ? project.registry.id : '';
        document.getElementById('project-image').value = project.dockerImage || '';
        document.getElementById('project-container').value = project.containerName || '';
        document.getElementById('project-compose').value = project.composeYaml || `version: '3.8'\nservices:\n  app:\n    image: ${project.dockerImage}\n    container_name: ${project.containerName}\n    env_file:\n      - .env`;
        
        document.getElementById('env-list').innerHTML = '';
        if (project.environments && project.environments.length > 0) {
            project.environments.forEach(env => this.addEnvRow(env.id, env.key, env.value));
        } else {
            this.addEnvRow();
        }

        document.getElementById('btn-rotate-token').style.display = 'block';
        document.getElementById('project-modal-title').innerText = 'Edit Project';
        document.getElementById('project-modal').classList.add('active');
    },

    async handleProjectSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('project-id').value;
        const data = {
            name: document.getElementById('project-name').value,
            dockerImage: document.getElementById('project-image').value,
            containerName: document.getElementById('project-container').value,
            composeYaml: document.getElementById('project-compose').value,
            server: { id: document.getElementById('project-server').value }
        };

        const registryId = document.getElementById('project-registry').value;
        if (registryId) {
            data.registry = { id: registryId };
        } else {
            data.registry = null;
        }

        // Resolve environments
        const envRows = document.querySelectorAll('.env-row');
        const envs = [];
        for (const row of envRows) {
            let envId = row.querySelector('.env-db-id').value;
            const key = row.querySelector('.env-key').value;
            const val = row.querySelector('.env-val').value;
            
            if (key) {
                if (!envId) {
                    // Create new custom environment variable in global pool
                    const newEnv = await this.api('environment', 'POST', { key, value: val });
                    envId = newEnv.id;
                } else {
                    // Update the existing environment variable if value changed
                    await this.api(`environment/${envId}`, 'PUT', { key, value: val });
                }
                envs.push({ id: envId });
            }
        }
        data.environments = envs;

        let project;
        if (id) project = await this.api(`projects/${id}`, 'PUT', data);
        else project = await this.api('projects', 'POST', data);

        this.showToast(`Project ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchProjects();
    },

    async deleteProject(id) {
        if(confirm('Are you sure you want to delete this project?')) {
            await this.api(`projects/${id}`, 'DELETE');
            this.showToast('Project deleted.');
            this.fetchProjects();
        }
    },

    async rotateProjectToken() {
        const id = document.getElementById('project-id').value;
        if (!id) return;
        if(confirm('Are you sure you want to rotate the webhook token? The old token will stop working immediately.')) {
            await this.api(`projects/${id}/rotate-token`, 'POST');
            this.showToast('Webhook token rotated successfully.');
            this.fetchProjects();
        }
    },

    addEnvRow(envId = null, key = '', val = '') {
        const list = document.getElementById('env-list');
        const id = Date.now() + Math.random().toString(36).substr(2, 5);
        const div = document.createElement('div');
        div.className = 'env-row';
        div.id = `env-${id}`;
        div.innerHTML = `
            <input type="hidden" class="env-db-id" value="${envId || ''}">
            <input type="text" class="env-key" placeholder="KEY" value="${key}" style="flex: 1">
            <input type="text" class="env-val" placeholder="VALUE" value="${val}" style="flex: 2">
            <button type="button" class="btn btn-danger" onclick="document.getElementById('env-${id}').remove()">X</button>
        `;
        list.appendChild(div);
    },

    addEnvFromPool() {
        const select = document.getElementById('env-select-dropdown');
        const id = select.value;
        if (!id) return;
        const env = this.environments.find(e => e.id == id);
        if (env) {
            this.addEnvRow(env.id, env.key, env.value);
            select.value = '';
        }
    },

    // --- Environments CRUD ---
    openEnvironmentModal() {
        document.getElementById('environment-form').reset();
        document.getElementById('environment-id').value = '';
        document.getElementById('environment-title').innerText = 'Add Environment';
        document.getElementById('environment-modal').classList.add('active');
    },

    async editEnvironment(id) {
        const env = this.environments.find(e => e.id == id);
        if (!env) return;
        document.getElementById('environment-id').value = env.id;
        document.getElementById('environment-key').value = env.key;
        document.getElementById('environment-value').value = env.value;
        document.getElementById('environment-description').value = env.description || '';
        document.getElementById('environment-title').innerText = 'Edit Environment';
        document.getElementById('environment-modal').classList.add('active');
    },

    async handleEnvironmentSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('environment-id').value;
        const data = {
            key: document.getElementById('environment-key').value,
            value: document.getElementById('environment-value').value,
            description: document.getElementById('environment-description').value
        };

        if (id) await this.api(`environment/${id}`, 'PUT', data);
        else await this.api('environment', 'POST', data);

        this.showToast(`Environment ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchEnvironments();
    },

    async deleteEnvironment(id) {
        if(confirm('Are you sure you want to delete this environment variable?')) {
            await this.api(`environment/${id}`, 'DELETE');
            this.showToast('Environment deleted.');
            this.fetchEnvironments();
        }
    },

    // --- Templates CRUD ---
    openTemplateModal() {
        document.getElementById('template-form').reset();
        document.getElementById('template-id').value = '';
        document.getElementById('template-edit-title').innerText = 'Add Template';
        document.getElementById('template-edit-modal').classList.add('active');
    },

    async editTemplate(id) {
        const t = this.templates.find(x => x.id == id);
        if (!t) return;
        document.getElementById('template-id').value = t.id;
        document.getElementById('template-name').value = t.name;
        document.getElementById('template-content').value = t.content;
        document.getElementById('template-edit-title').innerText = 'Edit Template';
        document.getElementById('template-edit-modal').classList.add('active');
    },

    async handleTemplateSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('template-id').value;
        const data = {
            name: document.getElementById('template-name').value,
            content: document.getElementById('template-content').value
        };

        if (id) await this.api(`template/${id}`, 'PUT', data);
        else await this.api('template', 'POST', data);

        this.showToast(`Template ${id ? 'updated' : 'added'} successfully.`);
        this.closeModals();
        this.fetchTemplates();
    },

    async deleteTemplate(id) {
        if(confirm('Are you sure you want to delete this template?')) {
            await this.api(`template/${id}`, 'DELETE');
            this.showToast('Template deleted.');
            this.fetchTemplates();
        }
    },

    // --- Settings & Token ---
    openTokenModal() {
        document.getElementById('token-modal-form').reset();
        document.getElementById('token-modal').classList.add('active');
    },

    openGhcrModal() {
        document.getElementById('ghcr-modal-form').reset();
        document.getElementById('ghcr-modal').classList.add('active');
    },

    async handleTokenSubmit(e) {
        e.preventDefault();
        
        const isModal = document.getElementById('token-modal').classList.contains('active');
        const value = isModal 
            ? document.getElementById('modal-agent-token').value 
            : document.getElementById('setting-agent-token').value;
            
        if (!value) {
            this.showToast('Please enter a valid token.', true);
            return;
        }
        await this.api('settings/AGENT_SECRET_TOKEN', 'PUT', { value });
        this.showToast('Global Secret Token saved successfully.');
        
        if (isModal) {
            this.closeModals();
        } else {
            document.getElementById('setting-agent-token').value = '';
        }
        
        this.fetchSettings();
    },

    async handleGhcrSubmit(e) {
        e.preventDefault();
        
        const isModal = document.getElementById('ghcr-modal').classList.contains('active');
        const username = isModal
            ? document.getElementById('modal-ghcr-username').value
            : document.getElementById('setting-ghcr-username').value;
        const token = isModal
            ? document.getElementById('modal-ghcr-token').value
            : document.getElementById('setting-ghcr-token').value;
            
        if (!username || !token) {
            this.showToast('Please fill in both Username and Token.', true);
            return;
        }
        
        await this.api('settings/GHCR_USERNAME', 'PUT', { value: username });
        await this.api('settings/GHCR_TOKEN', 'PUT', { value: token });
        this.showToast('GHCR credentials saved successfully.');
        
        if (isModal) {
            this.closeModals();
        } else {
            document.getElementById('setting-ghcr-username').value = '';
            document.getElementById('setting-ghcr-token').value = '';
        }
        
        this.fetchSettings();
    },

    // --- Integration Guide ---
    openGuideModal() {
        const projSelect = document.getElementById('guide-project');
        const tmpSelect = document.getElementById('guide-template');
        
        projSelect.innerHTML = '<option value="">Select a project</option>' + 
            this.projects.map(p => `<option value="${p.webhookToken}">${p.name}</option>`).join('');
            
        tmpSelect.innerHTML = '<option value="">Select a template</option>' + 
            this.templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

        document.getElementById('guide-code').innerText = 'Please select a project and a template.';
        document.getElementById('guide-modal').classList.add('active');
    },

    generateGuideCode() {
        const token = document.getElementById('guide-project').value;
        const tmpId = document.getElementById('guide-template').value;
        const codeEl = document.getElementById('guide-code');

        if (!token || !tmpId) {
            codeEl.innerText = 'Please select a project and a template.';
            return;
        }

        const t = this.templates.find(x => x.id == tmpId);
        if (!t) return;

        // Nginx translates /deploy directly to /api/webhook/deploy
        const url = 'https://MAIN_CENTER_URL/deploy';
        let result = t.content.replace(/\{\{WEBHOOK_URL\}\}/g, url);
        result = result.replace(/\{\{WEBHOOK_TOKEN\}\}/g, token);

        codeEl.innerText = result;
    },

    copyGuideCode() {
        const text = document.getElementById('guide-code').innerText;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Code copied to clipboard!');
        });
    },

    // --- Actions ---
    async triggerDeploy(token) {
        this.showToast('Deploy triggered...', false);
        try {
            await this.api('webhook/deploy', 'POST', null, { 'Authorization': `Bearer ${token}` });
            this.showToast('Deploy successful!');
            this.fetchHealth();
        } catch(e) {
            this.showToast('Deploy failed.', true);
        }
    },

    async triggerSelfUpdate() {
        const token = prompt('Enter the Agent Secret Token to authorize the self-update:');
        if(!token) return;
        if(confirm('This will trigger a docker pull and restart of this agent. Continue?')) {
            try {
                await this.api('webhook/self-update', 'POST', null, { 'Authorization': `Bearer ${token}` });
                this.showToast('Self-update initiated. The service might restart soon.');
            } catch (e) {
                this.showToast('Self-update failed or unauthorized.', true);
            }
        }
    },

    showToast(msg, isError = false) {
        const t = document.getElementById('toast');
        t.innerText = msg;
        t.style.borderLeft = `4px solid ${isError ? 'var(--danger)' : 'var(--primary)'}`;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.onload = () => app.init();
