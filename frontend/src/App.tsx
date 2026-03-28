import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPanelPage } from "./admin/AdminPanelPage";
import { ObsScoreboardPage } from "./obs-scoreboard/ObsScoreboardPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<ObsScoreboardPage />} />
      <Route path="/controlpanel" element={<AdminPanelPage />} />
      <Route path="/admin" element={<Navigate to="/controlpanel" replace />} />
    </Routes>
  );
}

export default App;
