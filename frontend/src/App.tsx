import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import AppRoutes from './routes';

const App = () => (
    <ErrorBoundary>
        <Layout>
            <AppRoutes />
        </Layout>
    </ErrorBoundary>
);

export default App;
