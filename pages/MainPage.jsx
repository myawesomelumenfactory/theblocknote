import LatestMessagesBlocks from '../components/LatestMessagesBlocks';
import SPEAK from '../components/SPEAK';

function MainPage() {
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-4 lg:pb-6 min-h-full h-full flex flex-col">
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-6 flex-1 min-h-0">
        <div className="w-full lg:w-1/2 min-w-0 lg:overflow-y-auto">
          <SPEAK />
        </div>
        <div className="w-full lg:w-1/2 min-w-0 flex-1 flex flex-col min-h-0">
          <LatestMessagesBlocks />
        </div>
      </div>
    </div>
  );
}

export default MainPage
