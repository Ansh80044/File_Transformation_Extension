document.getElementById('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('status');
    statusDiv.textContent = "Processing...";

    // Read checkboxes
    const constraints = {
        forceJpg: document.getElementById('forceJpg').checked,
        compress: document.getElementById('compress').checked
    };

    try {
        const transformer = new FileTransformer();
        const resultFile = await transformer.transformFile(file, constraints);

        statusDiv.textContent = `Success! New size: ${(resultFile.size/1024).toFixed(1)} KB`;
        
        // Auto-Download
        const url = URL.createObjectURL(resultFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = resultFile.name;
        a.click();
        
    } catch (error) {
        console.error(error);
        statusDiv.textContent = "Error: " + error.message;
    }
});