const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

/**
 * Sends a POST request to a given n8n webhook URL.
 * @param {string} webhookUrl - The URL of the n8n webhook.
 * @param {object} data - The payload to send.
 * @param {string} filePath - Optional path to a file to send as multipart/form-data.
 */
exports.triggerN8n = async (webhookUrl, data, filePath = null) => {
    if (!webhookUrl) {
        console.warn("n8n Webhook URL is missing. Skipping trigger.");
        return;
    }
    
    try {
        console.log(`Triggering n8n webhook: ${webhookUrl}`);
        let response;

        if (filePath && fs.existsSync(filePath)) {
            const form = new FormData();
            
            // Add all JSON data as fields
            for (const key in data) {
                form.append(key, String(data[key]));
            }
            
            // Read into buffer to allow safe deletion of the file immediately after returning from this function
            const fileBuffer = fs.readFileSync(filePath);
            form.append('data', fileBuffer, { filename: data.filename || 'document.pdf' });
            
            response = await axios.post(webhookUrl, form, {
                headers: { ...form.getHeaders() }
            });
        } else {
            response = await axios.post(webhookUrl, data);
        }

        console.log("n8n Response:", response.status, response.statusText);
        return response.data;
    } catch (err) {
        console.error("n8n Webhook Error:", err.response ? err.response.data : err.message);
    }
};
