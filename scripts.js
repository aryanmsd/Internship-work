let signupBtn = document.getElementById("signupBtn");
let signinBtn = document.getElementById("signinBtn");
let nameField = document.getElementById("nameField");
let title = document.getElementById("title");
let lostPassword = document.getElementById("lostPassword");
const authForm = document.getElementById("authForm");
const API_BASE_URL = 'http://192.168.29.93:3001/api';

async function handleAuthSubmit(isSignUp) {
    const username = document.querySelector("input[placeholder='UserName']")?.value;
    const email = document.querySelector("input[placeholder='Email']").value;
    const password = document.querySelector("input[placeholder='Password']").value;

    if (!email || !password) {
        alert("Please fill in all required fields");
        return;
    }

    if (isSignUp && !username) {
        alert("Please enter a username");
        return;
    }
    const activeBtn = isSignUp ? signupBtn : signinBtn;
    const originalText = activeBtn.textContent;
    activeBtn.textContent = 'Processing...';
    activeBtn.disabled = true;

    try {
        if (isSignUp) {
            const response = await fetch(`${API_BASE_URL}/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                alert("Signed up successfully! Please log in.");
                nameField.style.maxHeight = "0";
                title.innerHTML = "Sign In";
                signinBtn.classList.remove("disable");
                signupBtn.classList.add("disable");
                lostPassword.style.display = "block";
                const emailInput = document.querySelector("input[placeholder='Email']");
                const passwordInput = document.querySelector("input[placeholder='Password']");
                const usernameInput = document.querySelector("input[placeholder='UserName']");
                
                if (usernameInput) usernameInput.value = "";
                passwordInput.value = "";
            } else {
                alert(data.error || "Signup failed");
            }
        } else {
            const response = await fetch(`${API_BASE_URL}/signin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    email, 
                    password,
                    username: username || email.split('@')[0] // Use provided username or email prefix
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert("Login successful!");
                sessionStorage.setItem('currentUser', JSON.stringify(data.user));
                window.location.href = "todo.html";
            } else {
                alert(data.error || "Login failed");
            }
        }
    } catch (error) {
        console.error('Error:', error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            alert("Cannot connect to server. Please make sure the backend server is running on http://192.168.29.93:3001");
        } else {
            alert("Network error. Please check your connection.");
        }
    } finally {
        activeBtn.textContent = originalText;
        activeBtn.disabled = false;
    }
}

signupBtn.onclick = function () {
    if (!signupBtn.classList.contains("disable")) {
        handleAuthSubmit(true);
    } else {
        nameField.style.maxHeight = "60px";
        title.innerHTML = "Sign Up";
        signupBtn.classList.remove("disable");
        signinBtn.classList.add("disable");
        lostPassword.style.display = "none";
    }
};

signinBtn.onclick = function () {
    if (!signinBtn.classList.contains("disable")) {
        handleAuthSubmit(false);
    } else {
        // Switch to sign in mode
        nameField.style.maxHeight = "0";
        title.innerHTML = "Sign In";
        signinBtn.classList.remove("disable");
        signupBtn.classList.add("disable");
        lostPassword.style.display = "block";
    }
};