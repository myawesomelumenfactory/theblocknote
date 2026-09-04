import { createContext } from 'react';

export const SharedContext = createContext();

export const ShareProvider = ({children}) => {
    const [refs, setRefs] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    return (
        <ShareProvider.Provider value={{ refs, setRefs, currentIndex, setCurrentIndex }}>
            {children}
        </ShareProvider.Provider>
    );
}