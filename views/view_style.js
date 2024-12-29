document.addEventListener('DOMContentLoaded', () => {

    /** 
     * ==================================================
     * ================= Name Page ======================
     * ================================================== 
     */
    const inputField = document.getElementById('name-input');
    const submitButton = document.getElementById('submit-button');

    inputField.addEventListener('input', () => {
        if (inputField.value.trim() !== '') {
            // Enable the button and change its style
            submitButton.classList.add('active');
            submitButton.disabled = false;
        } else {
            // Reset the button style and disable it
            submitButton.classList.remove('active');
            submitButton.disabled = true;
        }
    });
});