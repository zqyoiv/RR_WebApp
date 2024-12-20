const MAX_SELECTION = 3;
const selectedTop3 = new Set();
const selectedBottom3 = new Set();

function handleTop3Selection(event) {
    const selectedValue = event.target.value;

    if (event.target.checked) {
        // Add to top3
        selectedTop3.add(selectedValue);

        // Ensure FIFO logic for Top3
        if (selectedTop3.size > MAX_SELECTION) {
            const firstSelected = Array.from(selectedTop3)[0];
            selectedTop3.delete(firstSelected);
            document.querySelector(`input[name="top3"][value="${firstSelected}"]`).checked = false;
        }
    } else {
        // Remove from Top3
        selectedTop3.delete(selectedValue);
    }
}

function handleBottom3Selection(event) {
    const selectedValue = event.target.value;

    if (event.target.checked) {
        // Add to Bottom3
        selectedBottom3.add(selectedValue);

        // Ensure FIFO logic for Bottom3
        if (selectedBottom3.size > MAX_SELECTION) {
            const firstSelected = Array.from(selectedBottom3)[0];
            selectedBottom3.delete(firstSelected);
            document.querySelector(`input[name="bottom3"][value="${firstSelected}"]`).checked = false;
        }
    } else {
        // Remove from Bottom3
        selectedBottom3.delete(selectedValue);
    }
}



