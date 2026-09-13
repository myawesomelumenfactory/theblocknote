import LatestMessagesBlocks from '../components/LatestMessagesBlocks';
import SPEAK from '../components/SPEAK';

function MainPage() {
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="w-full lg:w-1/2 min-w-0 lg:sticky lg:top-4 lg:z-[5] lg:self-start">
          <SPEAK />
        </div>
        <div className="w-full lg:w-1/2 min-w-0">
          <LatestMessagesBlocks />
        </div>
      </div>
    </div>
  );
}

export default MainPage
