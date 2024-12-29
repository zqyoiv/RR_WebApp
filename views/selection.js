const MAX_SELECTION = 3;
const selectedTop3 = new Set();
const selectedBottom3 = new Set();

function handleTop3Selection(event) {
    const selectedValue = event.target.value;
    const input = event.target;
    const submitButton = document.getElementById('submit-button');

    if (!selectedTop3.has(selectedValue)) {
        // Add to top3
        selectedTop3.add(selectedValue);
        input.classList.add('selected');

        // Ensure FIFO logic for Top3
        if (selectedTop3.size > MAX_SELECTION) {
            const firstSelected = Array.from(selectedTop3)[0];
            selectedTop3.delete(firstSelected);
            document.querySelector(`input[name="top3"][value="${firstSelected}"]`).classList.remove('selected');
        }
    } else {
        // Remove from Top3
        selectedTop3.delete(selectedValue);
        input.classList.remove('selected');
    }

    // Update submit buttom state.
    if (selectedTop3.size == 3) {
        submitButton.classList.add('active');
        submitButton.disabled = false;
    } else {
        submitButton.classList.remove('active');
        submitButton.disabled = true;
    }
}

function handleBottom3Selection(event) {
    const selectedValue = event.target.value;
    const input = event.target;
    const submitButton = document.getElementById('submit-button');

    if (!selectedBottom3.has(selectedValue)) {
        // Add to Bottom3
        selectedBottom3.add(selectedValue);
        input.classList.add('selected');

        // Ensure FIFO logic for Bottom3
        if (selectedBottom3.size > MAX_SELECTION) {
            const firstSelected = Array.from(selectedBottom3)[0];
            selectedBottom3.delete(firstSelected);
            document.querySelector(`input[name="bottom3"][value="${firstSelected}"]`).classList.remove('selected');
        }
    } else {
        // Remove from Bottom3
        selectedBottom3.delete(selectedValue);
        input.classList.remove('selected');
    }

    // Update submit buttom state.
    if (selectedBottom3.size == 3) {
        submitButton.classList.add('active');
        submitButton.disabled = false;
    } else {
        submitButton.classList.remove('active');
        submitButton.disabled = true;
    }
}



