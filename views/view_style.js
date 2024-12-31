document.addEventListener('touchmove', function(event) {
    event.preventDefault();
}, { passive: false });

function adjustViewport() {
    const appElement = document.getElementById('app');
    appElement.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', adjustViewport);


document.addEventListener('DOMContentLoaded', () => {

    /** 
     * =================================================
     * ================= Name Page ======================
     * ================================================== 
     */
    if (document.getElementById('name-page') != null) {
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
    }
});