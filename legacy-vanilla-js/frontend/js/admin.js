(function(POSM) {
    'use strict';

    var availableWorkspaces = [];

    // ---- RENDER GROUPS TABLE ----
    function renderGroups() {
        var groups = POSM.getGroups();
        var tbody = document.getElementById('groups-tbody');
        tbody.innerHTML = '';

        Object.keys(groups).forEach(function(gid) {
            var g = groups[gid];
            var tr = document.createElement('tr');

            var tdId = document.createElement('td');
            tdId.textContent = gid;

            var tdLabel = document.createElement('td');
            tdLabel.textContent = g.label;

            var tdWs = document.createElement('td');
            var wsText = (g.workspaces || []).join(', ');
            if (g.workspaces && g.workspaces.indexOf('__ALL__') !== -1) wsText = 'All Workspaces';
            tdWs.textContent = wsText;

            var tdActions = document.createElement('td');
            var delBtn = document.createElement('button');
            delBtn.className = 'admin-btn-sm admin-btn-danger';
            delBtn.textContent = 'Remove';
            delBtn.addEventListener('click', function() {
                delete groups[gid];
                POSM.setGroups(groups);
                renderGroups();
                renderUserForm();
            });
            tdActions.appendChild(delBtn);

            tr.appendChild(tdId);
            tr.appendChild(tdLabel);
            tr.appendChild(tdWs);
            tr.appendChild(tdActions);
            tbody.appendChild(tr);
        });
    }

    // ---- RENDER USERS TABLE ----
    function renderUsers() {
        var users = POSM.getUsers();
        var tbody = document.getElementById('users-tbody');
        tbody.innerHTML = '';

        users.forEach(function(u, idx) {
            var tr = document.createElement('tr');

            var tdUser = document.createElement('td');
            tdUser.textContent = u.username;

            var tdName = document.createElement('td');
            tdName.textContent = u.displayName;

            var tdGroups = document.createElement('td');
            tdGroups.textContent = (u.groups || []).join(', ');

            var tdActions = document.createElement('td');
            var delBtn = document.createElement('button');
            delBtn.className = 'admin-btn-sm admin-btn-danger';
            delBtn.textContent = 'Remove';
            delBtn.addEventListener('click', function() {
                users.splice(idx, 1);
                POSM.setUsers(users);
                renderUsers();
            });
            tdActions.appendChild(delBtn);

            tr.appendChild(tdUser);
            tr.appendChild(tdName);
            tr.appendChild(tdGroups);
            tr.appendChild(tdActions);
            tbody.appendChild(tr);
        });
    }

    // ---- RENDER GROUP FORM (workspace checkboxes) ----
    function renderGroupForm() {
        var container = document.getElementById('group-ws-checkboxes');
        container.innerHTML = '';

        // Add "__ALL__" option
        var allLabel = document.createElement('label');
        allLabel.className = 'admin-cb-label';
        var allCb = document.createElement('input');
        allCb.type = 'checkbox';
        allCb.value = '__ALL__';
        allLabel.appendChild(allCb);
        allLabel.appendChild(document.createTextNode(' All Workspaces'));
        container.appendChild(allLabel);

        availableWorkspaces.forEach(function(ws) {
            var lbl = document.createElement('label');
            lbl.className = 'admin-cb-label';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = ws;
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(' ' + ws));
            container.appendChild(lbl);
        });
    }

    // ---- RENDER USER FORM (group checkboxes) ----
    function renderUserForm() {
        var container = document.getElementById('user-group-checkboxes');
        container.innerHTML = '';
        var groups = POSM.getGroups();

        Object.keys(groups).forEach(function(gid) {
            var lbl = document.createElement('label');
            lbl.className = 'admin-cb-label';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = gid;
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(' ' + groups[gid].label + ' (' + gid + ')'));
            container.appendChild(lbl);
        });
    }

    // ---- ADD GROUP ----
    document.getElementById('add-group-btn').addEventListener('click', function() {
        var gid = document.getElementById('group-id-input').value.trim();
        var label = document.getElementById('group-label-input').value.trim();
        if (!gid || !label) return;

        var checkboxes = document.querySelectorAll('#group-ws-checkboxes input:checked');
        var workspaces = [];
        checkboxes.forEach(function(cb) { workspaces.push(cb.value); });

        var groups = POSM.getGroups();
        groups[gid] = { label: label, workspaces: workspaces };
        POSM.setGroups(groups);

        document.getElementById('group-id-input').value = '';
        document.getElementById('group-label-input').value = '';
        document.querySelectorAll('#group-ws-checkboxes input').forEach(function(cb) { cb.checked = false; });

        renderGroups();
        renderUserForm();
    });

    // ---- ADD USER ----
    document.getElementById('add-user-btn').addEventListener('click', function() {
        var username = document.getElementById('user-username-input').value.trim();
        var displayName = document.getElementById('user-display-input').value.trim();
        if (!username || !displayName) return;

        var checkboxes = document.querySelectorAll('#user-group-checkboxes input:checked');
        var userGroups = [];
        checkboxes.forEach(function(cb) { userGroups.push(cb.value); });

        var users = POSM.getUsers();
        // Prevent duplicate usernames
        if (users.some(function(u) { return u.username === username; })) {
            alert('Username "' + username + '" already exists.');
            return;
        }
        users.push({ username: username, displayName: displayName, groups: userGroups });
        POSM.setUsers(users);

        document.getElementById('user-username-input').value = '';
        document.getElementById('user-display-input').value = '';
        document.querySelectorAll('#user-group-checkboxes input').forEach(function(cb) { cb.checked = false; });

        renderUsers();
    });

    // ---- RESET TO DEFAULTS ----
    document.getElementById('reset-defaults-btn').addEventListener('click', function() {
        if (!confirm('Reset all users and groups to defaults? This will erase any changes.')) return;
        localStorage.removeItem('posm_demo_users');
        localStorage.removeItem('posm_demo_groups');
        renderAll();
    });

    // ---- RENDER WORKSPACE LIST ----
    function renderWorkspaceList(workspaces) {
        var el = document.getElementById('ws-list');
        if (workspaces.length === 0) {
            el.textContent = 'No workspaces discovered. Is GeoServer running?';
            return;
        }
        el.innerHTML = '';
        workspaces.forEach(function(ws) {
            var span = document.createElement('span');
            span.className = 'ws-tag';
            span.textContent = ws;
            el.appendChild(span);
        });
    }

    // ---- INIT ----
    function renderAll() {
        renderGroups();
        renderUsers();
        renderGroupForm();
        renderUserForm();
    }

    async function init() {
        renderAll();

        // Discover workspaces from GeoServer
        availableWorkspaces = await POSM.discoverWorkspaces();
        renderWorkspaceList(availableWorkspaces);
        renderGroupForm();
    }

    init();

})(window.POSM);
