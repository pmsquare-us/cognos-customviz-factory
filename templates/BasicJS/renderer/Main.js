import { RenderBase } from "@businessanalytics/customvis-lib"; // rendering

/**
 * Template for plain Javascript implementations of a visualization. The template functions
 * found in this file are all optional, you can delete the ones you don't need.
 */

export default class extends RenderBase
{
    create( _node )
    {
        // Implement this function to provide one-time initialization of the visualization.
        // Return the root node of the visualization.
        return _node;
    }

    update( _info )
    {
        // Provide the rendering code of your visualization here. This function gets called
        // every time size has changed, there is new data or there are changed properties.
        _info.node.textContent = "Hello World";
    }

    updateProperty( _name, _value )
    {
        // Implement if you want to process changes to properties.
        // Typically you only need this if you want to modify the active state
        // of properties based on the value of other properties.
    }

    hitTest( _element, _client, _viewPort )
    {
        // Implement hit testing here. You can return the data element (data point or
        // tuple) that is at the specified client or viewport point. Return null if
        // no data point was hit.
        return super.hitTest(_elem, _client, _viewport);
    }
}
