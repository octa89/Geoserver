// ---- POSM Auth (demo / placeholder) ----
window.POSM = window.POSM || {};

(function(POSM) {
    'use strict';

    var STORAGE_KEY_USER = 'posm_current_user';
    var STORAGE_KEY_USERS = 'posm_demo_users';
    var STORAGE_KEY_GROUPS = 'posm_demo_groups';

    // ---- DEFAULT DEMO DATA ----
    var DEFAULT_USERS = [
        { username: 'admin', displayName: 'Administrator', groups: ['all'] },
        { username: 'user_posm', displayName: 'POSM User', groups: ['posm_gis'] },
        { username: 'user_other', displayName: 'Other User', groups: ['other_workspace'] }
    ];

    var DEFAULT_GROUPS = {
        'all': { label: 'All Workspaces', workspaces: ['__ALL__'] },
        'posm_gis': { label: 'POSM GIS', workspaces: ['POSM_GIS'] },
        'other_workspace': { label: 'Other Workspace', workspaces: [] }
    };

    // ---- PERSISTENCE (localStorage for admin edits, defaults as fallback) ----
    function loadUsers() {
        var stored = localStorage.getItem(STORAGE_KEY_USERS);
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { /* fall through */ }
        }
        return DEFAULT_USERS.slice();
    }

    function saveUsers(users) {
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }

    function loadGroups() {
        var stored = localStorage.getItem(STORAGE_KEY_GROUPS);
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { /* fall through */ }
        }
        return JSON.parse(JSON.stringify(DEFAULT_GROUPS));
    }

    function saveGroups(groups) {
        localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(groups));
    }

    // ---- PUBLIC API ----

    POSM.getUsers = function() {
        return loadUsers();
    };

    POSM.setUsers = function(users) {
        saveUsers(users);
    };

    POSM.getGroups = function() {
        return loadGroups();
    };

    POSM.setGroups = function(groups) {
        saveGroups(groups);
    };

    POSM.login = function(username) {
        var users = loadUsers();
        var user = users.find(function(u) { return u.username === username; });
        if (!user) return false;
        sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        return true;
    };

    POSM.logout = function() {
        sessionStorage.removeItem(STORAGE_KEY_USER);
        sessionStorage.removeItem('posm_selected_workspace');
        window.location.href = 'index.html';
    };

    POSM.setSelectedWorkspace = function(ws) {
        sessionStorage.setItem('posm_selected_workspace', ws);
    };

    POSM.getSelectedWorkspace = function() {
        return sessionStorage.getItem('posm_selected_workspace');
    };

    POSM.getCurrentUser = function() {
        var stored = sessionStorage.getItem(STORAGE_KEY_USER);
        if (!stored) return null;
        try { return JSON.parse(stored); } catch (e) { return null; }
    };

    POSM.getUserWorkspaces = function() {
        var user = POSM.getCurrentUser();
        if (!user) return [];
        var groups = loadGroups();
        var workspaces = [];
        (user.groups || []).forEach(function(gid) {
            var group = groups[gid];
            if (group && group.workspaces) {
                group.workspaces.forEach(function(ws) {
                    if (workspaces.indexOf(ws) === -1) workspaces.push(ws);
                });
            }
        });
        return workspaces;
    };

    POSM.requireAuth = function() {
        if (!POSM.getCurrentUser()) {
            window.location.href = 'index.html';
            return false;
        }
        return true;
    };

    // ---- DISCOVER AVAILABLE WORKSPACES FROM GEOSERVER ----
    POSM.discoverWorkspaces = async function() {
        try {
            // Try REST API first
            var resp = await fetch('/geoserver/rest/workspaces.json');
            if (resp.ok) {
                var data = await resp.json();
                if (data.workspaces && data.workspaces.workspace) {
                    return data.workspaces.workspace.map(function(w) { return w.name; });
                }
            }
        } catch (e) {
            console.warn('REST workspace discovery failed, trying WFS fallback:', e);
        }

        // Fallback: parse WFS GetCapabilities from the default workspace
        try {
            var capsResp = await fetch('/geoserver/wfs?service=WFS&version=1.1.0&request=GetCapabilities');
            var text = await capsResp.text();
            var parser = new DOMParser();
            var xml = parser.parseFromString(text, 'text/xml');
            var featureTypes = xml.querySelectorAll('FeatureType Name');
            var wsSet = {};
            featureTypes.forEach(function(el) {
                var name = el.textContent;
                if (name.indexOf(':') !== -1) {
                    wsSet[name.split(':')[0]] = true;
                }
            });
            var result = Object.keys(wsSet);
            return result.length > 0 ? result : ['POSM_GIS'];
        } catch (e2) {
            console.warn('WFS workspace discovery failed:', e2);
            return ['POSM_GIS'];
        }
    };

})(window.POSM);
