const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BACKEND_BASE_URL = isLocalhost 
    ? 'http://localhost:3000' 
    : 'https://complaints-registration-platform-full-o0bp.onrender.com';
const API_BASE = `${BACKEND_BASE_URL}/api`;
// DOM Elements
const sections = {
    register: document.getElementById('register-page'),
    login: document.getElementById('login-page'),
    myComplaints: document.getElementById('my-complaints-page'),
    submitComplaint: document.getElementById('submit-complaint-page'),
    adminDashboard: document.getElementById('admin-dashboard-page'),
};

const navbar = document.getElementById('navbar');
const navAdminBtn = document.getElementById('nav-admin-dashboard');
const toastContainer = document.getElementById('toast-container');

let currentUser = null;
let currentComplaintData = {
    text: '',
    aiQuestion: ''
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupEventListeners();
});

// --- Auth State ---
async function checkSession() {
    try {
        const headers = {};
        const token = localStorage.getItem('token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${API_BASE}/auth/me`, {
            credentials: 'include',
            headers
        });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            showDashboard();
        } else {
            showPage('login');
        }
    } catch (err) {
        showPage('login');
    }
}

function showDashboard() {
    navbar.classList.remove('hidden');
    if (currentUser.role === 'admin') {
        navAdminBtn.classList.remove('hidden');
        showPage('adminDashboard');
        fetchAdminComplaints();
    } else {
        navAdminBtn.classList.add('hidden');
        showPage('myComplaints');
        fetchMyComplaints();
    }
}

// --- Routing ---
function showPage(pageId) {
    Object.values(sections).forEach(sec => sec.classList.add('hidden'));
    sections[pageId].classList.remove('hidden');

    // Hide navbar for auth pages
    if (pageId === 'register' || pageId === 'login') {
        navbar.classList.add('hidden');
    } else {
        navbar.classList.remove('hidden');
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Nav links
    document.getElementById('nav-my-complaints').onclick = () => {
        showPage('myComplaints');
        fetchMyComplaints();
    };
    document.getElementById('nav-admin-dashboard').onclick = () => {
        showPage('adminDashboard');
        fetchAdminComplaints();
    };
    document.getElementById('logout-btn').onclick = logout;
    document.getElementById('btn-new-complaint').onclick = () => {
        showPage('submitComplaint');
        resetComplaintForm();
    };

    // Auth switches
    document.getElementById('go-to-login').onclick = (e) => { e.preventDefault(); showPage('login'); };
    document.getElementById('go-to-register').onclick = (e) => { e.preventDefault(); showPage('register'); };

    // Forms
    document.getElementById('register-form').onsubmit = handleRegister;
    document.getElementById('otp-form').onsubmit = handleVerifyOTP;
    document.getElementById('password-form').onsubmit = handlePasswordSetup;
    document.getElementById('login-form').onsubmit = handleLogin;

    // Complaint Flow
    document.getElementById('btn-get-ai-question').onclick = getAIQuestion;
    document.getElementById('btn-submit-full-complaint').onclick = submitFullComplaint;
}

// --- Auth Handlers ---
async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;

    const res = await apiCall('/auth/send-otp', 'POST', { name, email });
    if (res.ok) {
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('otp-screen').classList.remove('hidden');
        showToast('OTP sent to your email!', 'success');
    }
}

async function handleVerifyOTP(e) {
    e.preventDefault();
    const otp = document.getElementById('reg-otp').value;
    // OTP is verified together with password in the register endpoint as per BACKEND.md requirements
    // but the UI shows it as a step. We'll just store it and move to password.
    document.getElementById('otp-screen').classList.add('hidden');
    document.getElementById('password-screen').classList.remove('hidden');
}

async function handlePasswordSetup(e) {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const otp = document.getElementById('reg-otp').value;
    const password = document.getElementById('reg-pass').value;
    const confirm = document.getElementById('reg-confirm-pass').value;

    if (password !== confirm) return showToast('Passwords do not match', 'error');

    const res = await apiCall('/auth/register', 'POST', { email, otp, password });
    if (res.ok) {
        showToast('Registration successful! Please login.', 'success');
        showPage('login');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;

    const res = await apiCall('/auth/login', 'POST', { email, password });
    if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        if (data.token) {
            localStorage.setItem('token', data.token);
        }
        showToast('Welcome back!', 'success');
        showDashboard();
    }
}

async function logout() {
    await apiCall('/auth/logout', 'POST');
    currentUser = null;
    localStorage.removeItem('token');
    showPage('login');
}

// --- Complaint Handlers ---
async function getAIQuestion() {
    const text = document.getElementById('complaint-text').value;
    if (!text) return showToast('Please enter your complaint', 'error');

    const btn = document.getElementById('btn-get-ai-question');
    btn.innerText = 'Analyzing...';
    btn.disabled = true;

    const res = await apiCall('/ai/question', 'POST', { complaint_text: text });
    if (res.ok) {
        const data = await res.json();
        currentComplaintData.text = text;
        currentComplaintData.aiQuestion = data.question;

        document.getElementById('initial-step').classList.add('hidden');
        document.getElementById('ai-step').classList.remove('hidden');
        document.getElementById('display-ai-question').innerText = data.question;
    }
    btn.innerText = 'Next Step: AI Follow-up';
    btn.disabled = false;
}

async function submitFullComplaint() {
    const answer = document.getElementById('ai-answer').value;
    if (!answer) return showToast('Please answer the follow-up question', 'error');

    const res = await apiCall('/complaints', 'POST', {
        complaint_text: currentComplaintData.text,
        ai_question: currentComplaintData.aiQuestion,
        user_answer: answer
    });

    if (res.ok) {
        showToast('Complaint submitted successfully!', 'success');
        showPage('myComplaints');
        fetchMyComplaints();
    }
}

function resetComplaintForm() {
    document.getElementById('initial-step').classList.remove('hidden');
    document.getElementById('ai-step').classList.add('hidden');
    document.getElementById('complaint-text').value = '';
    document.getElementById('ai-answer').value = '';
}

// --- Data Fetching ---
async function fetchMyComplaints() {
    const res = await apiCall('/complaints/my', 'GET');
    if (res.ok) {
        const complaints = await res.json();
        const list = document.getElementById('complaints-list');
        if (complaints.length === 0) {
            list.innerHTML = '<p class="empty-msg">No complaints submitted yet.</p>';
            return;
        }
        list.innerHTML = complaints.map(c => renderComplaint(c)).join('');
    }
}

async function fetchAdminComplaints() {
    const res = await apiCall('/admin/complaints', 'GET');
    if (res.ok) {
        const complaints = await res.json();
        const list = document.getElementById('admin-complaints-list');
        list.innerHTML = complaints.map(c => renderComplaint(c, true)).join('');
    }
}

function renderComplaint(c, isAdmin = false) {
    return `
        <div class="complaint-card">
            <div class="complaint-meta">
                <span>${isAdmin ? `<strong>${c.userName}</strong> (${c.userEmail})` : 'Complaint ID: #' + c.id}</span>
                <span>${new Date(c.created_at).toLocaleDateString()}</span>
            </div>
            <p class="complaint-text">${c.complaintText}</p>
            <div class="complaint-ai-section">
                <p class="ai-q">Q: ${c.aiQuestion}</p>
                <p class="user-a">A: ${c.userAnswer}</p>
            </div>
        </div>
    `;
}

// --- Helpers ---
async function apiCall(endpoint, method, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
        credentials: 'include'
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, options);
        if (!res.ok) {
            const data = await res.json();
            showToast(data.error || 'Something went wrong', 'error');
        }
        return res;
    } catch (err) {
        console.error('Fetch Error:', err);
        showToast('Network error. Is the backend running?', 'error');
        return { ok: false };
    }
}

function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
