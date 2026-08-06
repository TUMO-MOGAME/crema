import { Route, Routes } from 'react-router';
import { BrewLog } from '../features/brews/brew-log';

/**
 * The routes.
 *
 * One today, and the router is here anyway because the coach lands at `/coach`
 * in Phase 6 and retrofitting routing around a page that assumed it was the
 * whole app is more work than declaring one route now.
 *
 * The catch-all sends unknown paths to the log rather than to a 404 screen. A
 * brew log has one place worth being, and a dead end would be a page whose only
 * content is a link back.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<BrewLog />} />
      <Route path="*" element={<BrewLog />} />
    </Routes>
  );
}
