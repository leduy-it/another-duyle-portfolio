import { createApplication } from "../src/server/application.mjs";
import { productionStore } from "../src/server/store.mjs";

const application = createApplication({ store: productionStore(process.env) });
export default { fetch: application };
