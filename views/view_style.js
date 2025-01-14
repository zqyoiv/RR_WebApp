document.addEventListener('touchmove', function(event) {
    event.preventDefault();
}, { passive: false });

function adjustViewport() {
    const appElement = document.getElementById('app');
    appElement.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', adjustViewport);


document.addEventListener('DOMContentLoaded', () => {

    // Remove default double click causing zoom in.
    document.addEventListener('dblclick', function (e) {
        e.preventDefault();
      }, { passive: false });

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

    /** 
     * =================================================
     * ================= Result Page ===================
     * ================================================= 
     */
    if (document.getElementById('result-page') != null) {
        let flowerWaitStr = "Please wait for a few seconds and you’ll see it on the public screen";
        if (window.location.href.includes("10.16.0.21")) {
            flowerWaitStr = "Please wait for a few seconds and you’ll see it on the left screen";
        } else if (window.location.href.includes("10.16.0.22")) {
            flowerWaitStr = "Please wait for a few seconds and you’ll see it on the right screen";
        }
        const flowerDescriptionEl = document.getElementById('flower-wait-text');
        flowerDescriptionEl.innerText = flowerWaitStr;

        setTimeout(() => {
            document.getElementById("result-page").classList.remove("hidden");
            document.getElementById("wait-result-page").classList.add("hidden");
        }, 5000); // Display the wait for result page for 5 seconds.
    }
});