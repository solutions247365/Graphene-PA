package com.graphenepa.app;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.provider.Telephony;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;

public class SmsProvider {
    private static final String TAG = "SmsProvider";
    private Context context;

    public SmsProvider(Context context) {
        this.context = context;
    }

    /**
     * Read SMS messages from the device.
     * Returns last 90 days of messages (roughly 3 months).
     */
    public String getSmsMessages() {
        try {
            JSONArray messages = new JSONArray();
            ContentResolver contentResolver = context.getContentResolver();

            // Query SMS inbox
            String[] projection = new String[]{
                    Telephony.Sms._ID,
                    Telephony.Sms.ADDRESS,
                    Telephony.Sms.BODY,
                    Telephony.Sms.DATE,
                    Telephony.Sms.TYPE
            };

            // Calculate 90 days ago in milliseconds
            long ninetyDaysAgo = System.currentTimeMillis() - (90L * 24 * 60 * 60 * 1000);

            String selection = Telephony.Sms.DATE + " >= ?";
            String[] selectionArgs = new String[]{String.valueOf(ninetyDaysAgo)};

            // Sort by date descending
            String sortOrder = Telephony.Sms.DATE + " DESC";

            Cursor cursor = contentResolver.query(
                    Telephony.Sms.CONTENT_URI,
                    projection,
                    selection,
                    selectionArgs,
                    sortOrder
            );

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    try {
                        int idIndex = cursor.getColumnIndex(Telephony.Sms._ID);
                        int addressIndex = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
                        int bodyIndex = cursor.getColumnIndex(Telephony.Sms.BODY);
                        int dateIndex = cursor.getColumnIndex(Telephony.Sms.DATE);
                        int typeIndex = cursor.getColumnIndex(Telephony.Sms.TYPE);

                        String id = "sms_" + cursor.getLong(idIndex);
                        String address = cursor.getString(addressIndex);
                        String body = cursor.getString(bodyIndex);
                        long dateMillis = cursor.getLong(dateIndex);
                        int type = cursor.getInt(typeIndex);

                        // Convert to ISO 8601 timestamp
                        String timestamp = formatTimestamp(dateMillis);

                        // Type: 1 = received, 2 = sent
                        boolean isIncoming = type == Telephony.Sms.MESSAGE_TYPE_INBOX;

                        JSONObject message = new JSONObject();
                        message.put("id", id);
                        message.put("phone_number", address);
                        message.put("contact_name", extractNameFromNumber(address));
                        message.put("body", body);
                        message.put("is_incoming", isIncoming ? 1 : 0);
                        message.put("sent_at", timestamp);

                        messages.put(message);
                    } catch (Exception e) {
                        Log.w(TAG, "Error parsing SMS message", e);
                    }
                }
                cursor.close();
            }

            return messages.toString();
        } catch (Exception e) {
            Log.e(TAG, "Error reading SMS messages", e);
            return "[]";
        }
    }

    /**
     * Sync SMS with backend server.
     * Called by MainActivity after successful login.
     */
    public void syncSmsWithBackend(String email, String backendUrl) {
        new Thread(() -> {
            try {
                String smsJson = getSmsMessages();
                String jsonPayload = String.format(
                        "{\"email\":\"%s\",\"messages\":%s}",
                        email.replace("\"", "\\\""),
                        smsJson
                );

                // POST to backend
                java.net.URL url = new java.net.URL(backendUrl + "/api/sms/sync");
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);

                try (java.io.OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonPayload.getBytes("utf-8");
                    os.write(input, 0, input.length);
                }

                int status = conn.getResponseCode();
                if (status == 200) {
                    Log.d(TAG, "SMS sync successful");
                } else {
                    Log.w(TAG, "SMS sync failed with status: " + status);
                }

                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Error syncing SMS with backend", e);
            }
        }).start();
    }

    private String formatTimestamp(long dateMillis) {
        java.time.Instant instant = java.time.Instant.ofEpochMilli(dateMillis);
        return instant.toString();
    }

    private String extractNameFromNumber(String phoneNumber) {
        if (phoneNumber == null) return "Unknown";

        // Try to get contact name from contacts
        try {
            ContentResolver contentResolver = context.getContentResolver();
            String[] projection = new String[]{
                    android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
            };

            String selection = android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER + " = ?";
            String[] selectionArgs = new String[]{phoneNumber};

            Cursor cursor = contentResolver.query(
                    android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    projection,
                    selection,
                    selectionArgs,
                    null
            );

            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    String name = cursor.getString(0);
                    cursor.close();
                    return name;
                }
                cursor.close();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error getting contact name", e);
        }

        // Fall back to phone number
        return phoneNumber;
    }
}
