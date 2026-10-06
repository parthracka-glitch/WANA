import React, { useEffect, useState } from "react";
import { apiUrl } from "../../config/api";


const AdminLogs = () => {
  const [logs, setLogs] = useState([]);
  const token = localStorage.getItem("token");

  useEffect(() => {
    async function fetchLogs() {
      const res = await fetch(apiUrl("/logs/region"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLogs(data);
    }

    fetchLogs();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h2>Supervisor Activity Logs</h2>

      <table border="1" cellPadding="10" style={{ marginTop: "20px" }}>
        <thead>
          <tr>
            <th>Email</th>
            <th>Event</th>
            <th>Description</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log._id}>
              <td>{log.email}</td>
              <td>{log.eventType}</td>
              <td>{log.actionDescription}</td>
              <td>{new Date(log.timestamp).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminLogs;
